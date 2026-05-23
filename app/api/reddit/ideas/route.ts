import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { preferredStackGuidance } from '@/lib/content-planning/brand-context'
import type { BrandProfile } from '@/types/database'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export interface RedditIdea {
  title: string
  angle: string
  type: 'discussion' | 'story' | 'question' | 'resource' | 'ama'
  why_it_works: string
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

  const cleanSub = subreddit.replace(/^r\//, '')

  const [configResult, companyResult, brandResult] = await Promise.all([
    supabase
      .from('reddit_subreddit_configs')
      .select('rules_text, notes')
      .eq('company_id', companyId)
      .eq('subreddit', cleanSub)
      .maybeSingle(),
    supabase.from('companies').select('name').eq('id', companyId).single(),
    supabase.from('brand_profiles').select('*').eq('company_id', companyId).maybeSingle(),
  ])

  const trendingTitles = await fetchTrendingTitles(cleanSub)

  const prompt = buildPrompt({
    subreddit: cleanSub,
    companyName: companyResult.data?.name ?? null,
    rulesText: configResult.data?.rules_text ?? null,
    notes: configResult.data?.notes ?? null,
    brand: brandResult.data as BrandProfile | null,
    trendingTitles,
    topicHint,
  })

  const response = await openai.chat.completions.create({
    model: 'gpt-5.4-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.85,
  })

  const raw = response.choices[0]?.message?.content ?? '{}'
  let ideas: RedditIdea[] = []
  try {
    const parsed = JSON.parse(raw) as { ideas?: RedditIdea[] }
    ideas = parsed.ideas ?? []
  } catch {
    return NextResponse.json({ error: 'Failed to parse ideas' }, { status: 500 })
  }

  return NextResponse.json(ideas)
}

function buildPrompt(params: {
  subreddit: string
  companyName: string | null
  rulesText: string | null
  notes: string | null
  brand: BrandProfile | null
  trendingTitles: string[]
  topicHint?: string
}): string {
  const { subreddit, companyName, rulesText, notes, brand, trendingTitles, topicHint } = params
  const lines: string[] = []

  lines.push(`You are a Reddit content strategist who deeply understands community culture and what gets upvoted vs removed.`)
  lines.push(``)
  lines.push(`Generate 4 post ideas for r/${subreddit} that would genuinely resonate with the community and comply with all subreddit rules.`)

  if (rulesText) {
    lines.push(``)
    lines.push(`## r/${subreddit} Rules (you MUST comply with every rule)`)
    lines.push(rulesText)
  }

  if (notes) {
    lines.push(``)
    lines.push(`## Additional notes about r/${subreddit}`)
    lines.push(notes)
  }

  if (trendingTitles.length > 0) {
    lines.push(``)
    lines.push(`## Currently trending in r/${subreddit} (study the style and format, do NOT copy)`)
    trendingTitles.forEach((t, i) => lines.push(`${i + 1}. ${t}`))
  }

  if (companyName || brand) {
    lines.push(``)
    lines.push(`## Brand context (write as a genuine community member at this company)`)
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
      "why_it_works": "why this fits r/${subreddit}'s culture and would get traction"
    }
  ]
}`)
  lines.push(``)
  lines.push(`Rules for ideas:`)
  lines.push(`- Title must be specific and compelling, not generic filler`)
  lines.push(`- Absolutely zero marketing language — redditors will downvote it instantly`)
  lines.push(`- Each idea must use a different type`)
  lines.push(`- Every idea must comply with the subreddit rules listed above`)
  lines.push(`- Never use em dashes (—) — they are the clearest AI giveaway`)
  lines.push(`- No hashtags, no CTAs, no "check out my product"`)
  if (brand?.preferred_stack?.trim()) {
    lines.push(`- Technical examples and tooling should lean toward: ${brand.preferred_stack.trim()}`)
  }

  return lines.join('\n')
}

async function fetchTrendingTitles(sub: string): Promise<string[]> {
  try {
    const res = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=12`, {
      headers: { 'User-Agent': 'social-media-manager-bot/1.0' },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return []
    const data = await res.json() as {
      data?: { children?: Array<{ data?: { title?: string; is_self?: boolean } }> }
    }
    return (data.data?.children ?? [])
      .filter(c => c.data?.title && c.data?.is_self !== false)
      .map(c => c.data!.title!)
      .slice(0, 10)
  } catch {
    return []
  }
}
