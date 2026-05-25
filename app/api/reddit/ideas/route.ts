import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { preferredStackGuidance } from '@/lib/content-planning/brand-context'
import { formatSubredditContextForPrompt } from '@/lib/reddit/posting-guidance'
import { fetchTrendingPostTitles } from '@/lib/reddit/subreddit-meta'
import type { BrandProfile } from '@/types/database'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export interface RedditIdea {
  title: string
  angle: string
  type: 'discussion' | 'story' | 'question' | 'resource' | 'ama'
  why_it_works: string
  compliance: 'safe' | 'caution'
  compliance_note: string
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { companyId, subreddit, topicHint } = await req.json() as {
    companyId: string
    subreddit: string
    topicHint?: string
  }

  if (!companyId || !subreddit) {
    return NextResponse.json({ error: 'companyId and subreddit required' }, { status: 400 })
  }

  const cleanSub = subreddit.replace(/^r\//, '').toLowerCase()

  const [configResult, companyResult, brandResult, trendingTitles] = await Promise.all([
    supabase
      .from('reddit_subreddit_configs')
      .select('rules_text, notes, posting_guidance')
      .eq('company_id', companyId)
      .eq('subreddit', cleanSub)
      .maybeSingle(),
    supabase.from('companies').select('name').eq('id', companyId).single(),
    supabase.from('brand_profiles').select('*').eq('company_id', companyId).maybeSingle(),
    fetchTrendingPostTitles(cleanSub),
  ])

  const subredditBlock = formatSubredditContextForPrompt({
    subreddit: cleanSub,
    rulesText: configResult.data?.rules_text ?? null,
    notes: configResult.data?.notes ?? null,
    postingGuidance: configResult.data?.posting_guidance ?? null,
  })

  const prompt = buildPrompt({
    subreddit: cleanSub,
    subredditBlock,
    companyName: companyResult.data?.name ?? null,
    brand: brandResult.data as BrandProfile | null,
    trendingTitles,
    topicHint,
  })

  const response = await openai.chat.completions.create({
    model: 'gpt-5.4-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.75,
  })

  const raw = response.choices[0]?.message?.content ?? '{}'
  let ideas: RedditIdea[] = []
  try {
    const parsed = JSON.parse(raw) as { ideas?: RedditIdea[] }
    ideas = (parsed.ideas ?? []).filter(i => i.compliance !== 'caution' || i.title)
  } catch {
    return NextResponse.json({ error: 'Failed to parse ideas' }, { status: 500 })
  }

  return NextResponse.json(ideas)
}

function buildPrompt(params: {
  subreddit: string
  subredditBlock: string
  companyName: string | null
  brand: BrandProfile | null
  trendingTitles: string[]
  topicHint?: string
}): string {
  const { subreddit, subredditBlock, companyName, brand, trendingTitles, topicHint } = params
  const lines: string[] = []

  lines.push(`You are a Reddit content strategist who deeply understands community culture and what gets upvoted vs removed.`)
  lines.push(``)
  lines.push(`Generate 4 post ideas for r/${subreddit} that would genuinely resonate with the community.`)
  lines.push(`Every idea must be safe to submit — if an angle would trigger removal or "submission not allowed", do not include it.`)
  lines.push(``)
  lines.push(subredditBlock)

  if (trendingTitles.length > 0) {
    lines.push(``)
    lines.push(`## Currently trending in r/${subreddit} (study the style and format, do NOT copy)`)
    trendingTitles.forEach((t, i) => lines.push(`${i + 1}. ${t}`))
  }

  if (companyName || brand) {
    lines.push(``)
    lines.push(`## Brand context (write as a genuine community member — never as marketing)`)
    if (companyName) lines.push(`Company: ${companyName}`)
    if (brand?.tone) lines.push(`Tone: ${brand.tone}`)
    if (brand?.voice_notes) lines.push(`Voice: ${brand.voice_notes}`)
    if (brand?.target_audience) lines.push(`Audience: ${brand.target_audience}`)
    if (brand?.company_description) lines.push(`What we do: ${brand.company_description}`)
    if (brand?.products_services) lines.push(`Products/services: ${brand.products_services}`)
    if (brand?.value_proposition) lines.push(`Value proposition: ${brand.value_proposition}`)
    if (brand?.keywords?.length) lines.push(`Topics/keywords: ${brand.keywords.join(', ')}`)
    const stackLine = preferredStackGuidance(brand)
    if (stackLine) lines.push(stackLine)
  }

  if (topicHint?.trim()) {
    lines.push(``)
    lines.push(`## Topic focus`)
    lines.push(`Ideas should relate to: ${topicHint.trim()}`)
  }

  lines.push(``)
  lines.push(`## Output format`)
  lines.push(`Return JSON with an "ideas" array of exactly 4 items:`)
  lines.push(`{
  "ideas": [
    {
      "title": "the exact post title ready to copy-paste",
      "angle": "one sentence — what makes this interesting and the approach",
      "type": "discussion|story|question|resource|ama",
      "why_it_works": "why this fits r/${subreddit}'s culture and would get traction",
      "compliance": "safe",
      "compliance_note": "one sentence — which playbook rule this follows, or what risk was avoided"
    }
  ]
}`)
  lines.push(``)
  lines.push(`Rules for ideas:`)
  lines.push(`- All 4 ideas must have compliance "safe" — use "caution" only if you cannot produce 4 safe ideas; prefer replacing risky angles`)
  lines.push(`- Never suggest workflow walkthroughs, product demos, or "here's what we built" posts unless the playbook explicitly allows it`)
  lines.push(`- Prefer questions, lessons learned, failures, and debates over announcements`)
  lines.push(`- Title must be specific and compelling, not generic filler`)
  lines.push(`- Absolutely zero marketing language`)
  lines.push(`- Each idea must use a different type`)
  lines.push(`- Never use em dashes (—)`)
  lines.push(`- No hashtags, no CTAs, no links in the title`)
  if (brand?.preferred_stack?.trim()) {
    lines.push(`- Technical examples should lean toward: ${brand.preferred_stack.trim()}`)
  }

  return lines.join('\n')
}
