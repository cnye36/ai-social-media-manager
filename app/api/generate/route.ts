import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { retrieve } from '@/lib/rag/retrieve'
import type { Channel } from '@/types/database'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const CHANNEL_INSTRUCTIONS: Record<Channel, string> = {
  linkedin: `You are a LinkedIn content specialist. Write a professional thought leadership post.
- Tone: Professional but human, insightful, not salesy
- Length: 300–1300 characters
- Format: Strong opening hook, 2–4 short paragraphs with line breaks, 3–5 relevant hashtags at the end
- No corporate buzzwords, no clichés`,

  x: `You are a Twitter/X content specialist. Write a single engaging tweet.
- HARD LIMIT: 280 characters total (count carefully)
- Tone: Direct, punchy, conversational
- Include 1–2 relevant hashtags within the character limit
- Lead with a strong hook or surprising insight
- Single tweet only — no thread`,

  reddit: `You are a Reddit content specialist. Write an authentic Reddit post.
- First line must be: Title: <your title here>
- Then a blank line
- Then the post body (100–500 characters)
- Tone: Genuine, community-first, zero marketing speak
- End with a question or invitation to discuss
- Write as a real person sharing something interesting, not a brand`,

  facebook: `You are a Facebook content specialist. Write an engaging Facebook post.
- Tone: Friendly, approachable, story-driven
- Length: 100–400 characters
- End with a question or call-to-action
- At most 2 emojis if they feel natural
- Write as a brand speaking warmly to its community`,
}

export async function POST(request: Request) {
  const body = await request.json()
  const { companyId, topic, channels } = body as {
    companyId: string
    topic: string
    channels: Channel[]
  }

  if (!companyId || !topic?.trim() || !channels?.length) {
    return NextResponse.json(
      { error: 'companyId, topic, and at least one channel are required' },
      { status: 400 }
    )
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: brand }, knowledgeChunks] = await Promise.all([
    supabase.from('brand_profiles').select('*').eq('company_id', companyId).single(),
    retrieve(companyId, topic, 3).catch(() => []),
  ])

  const brandContext = brand
    ? [
        `Brand tone: ${brand.tone}`,
        brand.voice_notes && `Brand voice: ${brand.voice_notes}`,
        brand.target_audience && `Target audience: ${brand.target_audience}`,
        brand.keywords?.length && `Keywords to weave in: ${brand.keywords.join(', ')}`,
        brand.avoid_phrases?.length && `Phrases to avoid: ${brand.avoid_phrases.join(', ')}`,
      ]
        .filter(Boolean)
        .join('\n')
    : ''

  const knowledgeContext = knowledgeChunks.length
    ? '\n\nRelevant brand knowledge:\n' + knowledgeChunks.map(c => c.content).join('\n\n')
    : ''

  const results = await Promise.allSettled(
    channels.map(async (channel) => {
      const override = brand?.channel_overrides?.[channel]
      const overrideContext = [
        override?.tone && `Channel-specific tone: ${override.tone}`,
        override?.voice_notes && `Channel voice notes: ${override.voice_notes}`,
      ]
        .filter(Boolean)
        .join('\n')

      const systemPrompt = [
        CHANNEL_INSTRUCTIONS[channel],
        brandContext,
        overrideContext,
        knowledgeContext,
      ]
        .filter(Boolean)
        .join('\n\n')

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Write a ${channel} post about: ${topic}` },
        ],
        max_tokens: 800,
        temperature: 0.7,
      })

      const content = completion.choices[0].message.content ?? ''

      const { data: post, error } = await supabase
        .from('posts')
        .insert({
          company_id: companyId,
          channel,
          status: 'draft',
          content,
          ai_generated: true,
          generation_params: { topic, model: 'gpt-4o-mini' },
          content_variants: {},
          media_items: [],
        })
        .select()
        .single()

      if (error) throw new Error(`Failed to save ${channel} post: ${error.message}`)
      return post
    })
  )

  const posts = results
    .filter((r): r is PromiseFulfilledResult<unknown> => r.status === 'fulfilled')
    .map(r => r.value)

  const errors = results
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map(r => (r.reason as Error)?.message ?? 'Unknown error')

  return NextResponse.json({ posts, errors })
}
