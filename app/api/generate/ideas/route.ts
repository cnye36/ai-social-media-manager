import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { retrieve } from '@/lib/rag/retrieve'
import { normalizeContentGoal } from '@/lib/content/content-goal'
import { buildIdeasRecentPostsSection, fetchRecentPostsByChannels } from '@/lib/content/recent-posts'
import type { ContentGoal } from '@/types/agents'
import type { Channel } from '@/types/database'

const IDEA_CHANNELS: Channel[] = ['linkedin', 'x', 'reddit', 'facebook']

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export interface PostIdea {
  title: string
  description: string
  angle: ContentGoal
  suggestedChannels: Channel[]
  /** When "x" is in suggestedChannels: single tweet vs multi-tweet thread */
  xFormat?: 'post' | 'thread'
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { companyId?: string; count?: number; voice?: 'personal' | 'company' }
  const { companyId, count = 8, voice = 'company' } = body

  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

  const { data: company } = await supabase
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .eq('owner_id', user.id)
    .single()
  if (!company) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [{ data: brand }, chunks, recentByChannel] = await Promise.all([
    supabase.from('brand_profiles').select('tone, target_audience, keywords, voice_notes').eq('company_id', companyId).maybeSingle(),
    retrieve(companyId, 'products services features value proposition blog posts topics expertise', 12, 0.3).catch(() => [] as Awaited<ReturnType<typeof retrieve>>),
    fetchRecentPostsByChannels(supabase, companyId, IDEA_CHANNELS),
  ])

  const brandContext = [
    brand?.tone ? `Tone: ${brand.tone}` : null,
    brand?.target_audience ? `Target audience: ${brand.target_audience}` : null,
    brand?.keywords?.length ? `Key topics/keywords: ${brand.keywords.join(', ')}` : null,
    brand?.voice_notes ? `Voice notes: ${brand.voice_notes}` : null,
  ].filter(Boolean).join('\n')

  const knowledgeContext = chunks.length > 0
    ? chunks.map(c => (c.title ? `[${c.title}]\n${c.content}` : c.content)).join('\n\n---\n\n')
    : 'No knowledge base content available yet.'

  const recentPostsContext = buildIdeasRecentPostsSection(recentByChannel)

  const prompt = voice === 'personal'
    ? `You are a content strategist helping the founder/owner/developer behind ${company.name} build their personal brand on social media.

${brandContext ? `What they are building (for context only — use this to ground the ideas in their real work):\n${brandContext}\n` : ''}
Knowledge about what they are building:
${knowledgeContext}

${recentPostsContext}

Generate exactly ${count} diverse, specific personal post ideas. These are for the INDIVIDUAL's personal profile, not a company page. Requirements:
- Write ideas from the founder/owner/developer's first-person perspective — "I" voice, personal experience
- Focus heavily on these three content types (mix them up):
  1. EDUCATIONAL: AI/automation insights, how things actually work, lessons learned, technical breakdowns — teach something genuinely useful from their real experience
  2. BEHIND-THE-SCENES: Building in public, decisions made, mistakes made, what it is really like building an AI product/agency — raw and honest
  3. OPINION / HOT TAKE: Contrarian views on AI, takes on industry trends, things most people get wrong, strong opinions the founder actually holds
- Make titles punchy, specific, and first-person where natural ("Why I stopped using X", "We shipped this wrong — here's what I learned")
- Descriptions should explain the hook and what makes this interesting from a personal perspective
- Suggest 1-2 channels that fit best for each idea
- For each idea that includes "x" in suggestedChannels, set xFormat:
  - "thread" when the idea naturally spans 3–7 tweets (step-by-step guides, numbered lessons, breakdowns)
  - "post" for a single hot take or punchy one-liner

Return a JSON object with this exact shape:
{
  "ideas": [
    {
      "title": "Short punchy title (max 8 words)",
      "description": "1-2 sentences on the hook and why it resonates personally",
      "angle": "education" | "engagement" | "promotion" | "awareness",
      "suggestedChannels": ["linkedin" | "x" | "facebook"],
      "xFormat": "post" | "thread"
    }
  ]
}`
    : `You are a social media strategist for ${company.name}.

${brandContext ? `Brand context:\n${brandContext}\n` : ''}
Knowledge base excerpts:
${knowledgeContext}

${recentPostsContext}

Generate exactly ${count} diverse, specific post ideas for ${company.name}. Requirements:
- Each idea must be rooted in the actual company content above, not generic advice
- Vary the angles: mix educational, engagement, awareness, and promotion
- Make titles punchy and specific enough that the user immediately knows what to write
- Descriptions should explain the angle/hook and why it will resonate with the audience
- Suggest 1-2 channels that fit best for each idea
- For each idea that includes "x" in suggestedChannels, set xFormat:
  - "thread" when the idea naturally spans 3–7 tweets (step-by-step guides, numbered lessons, breakdowns, myth-busting series, before/after stories)
  - "post" for a single hot take, announcement, or one-liner hook

Return a JSON object with this exact shape:
{
  "ideas": [
    {
      "title": "Short punchy title (max 8 words)",
      "description": "1-2 sentences on what the post covers and why it works",
      "angle": "education" | "engagement" | "promotion" | "awareness",
      "suggestedChannels": ["linkedin" | "x" | "facebook"],
      "xFormat": "post" | "thread"
    }
  ]
}`

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-5.4-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.9,
      response_format: { type: 'json_object' },
    })

    const raw = completion.choices[0]?.message?.content ?? '{}'
    const parsed = JSON.parse(raw) as { ideas?: PostIdea[] }
    const ideas = (parsed.ideas ?? []).map(idea => ({
      ...idea,
      angle: normalizeContentGoal(idea.angle),
      suggestedChannels: Array.isArray(idea.suggestedChannels)
        ? idea.suggestedChannels.filter((ch): ch is Channel =>
            ['linkedin', 'x', 'reddit', 'facebook'].includes(ch))
        : [],
    }))

    return NextResponse.json({ ideas })
  } catch (err) {
    console.error('Idea generation error:', err)
    return NextResponse.json({ error: 'Failed to generate ideas' }, { status: 500 })
  }
}
