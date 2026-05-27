import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { retrieve } from '@/lib/rag/retrieve'
import type { ContentGoal } from '@/types/agents'
import type { Channel } from '@/types/database'

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

  const body = await req.json() as { companyId?: string; count?: number }
  const { companyId, count = 8 } = body

  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

  const { data: company } = await supabase
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .eq('owner_id', user.id)
    .single()
  if (!company) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [{ data: brand }, chunks] = await Promise.all([
    supabase.from('brand_profiles').select('tone, target_audience, keywords, voice_notes').eq('company_id', companyId).maybeSingle(),
    retrieve(companyId, 'products services features value proposition blog posts topics expertise', 12, 0.3).catch(() => [] as Awaited<ReturnType<typeof retrieve>>),
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

  const prompt = `You are a social media strategist for ${company.name}.

${brandContext ? `Brand context:\n${brandContext}\n` : ''}
Knowledge base excerpts:
${knowledgeContext}

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
    const ideas = parsed.ideas ?? []

    return NextResponse.json({ ideas })
  } catch (err) {
    console.error('Idea generation error:', err)
    return NextResponse.json({ error: 'Failed to generate ideas' }, { status: 500 })
  }
}
