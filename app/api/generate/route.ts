import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { retrieve } from '@/lib/rag/retrieve'
import { NO_EM_DASH_RULE, stripEmDashes } from '@/lib/content/no-em-dash'
import { buildChannelVarietyBlock } from '@/lib/content/channel-variety'
import { fetchRecentChannelPosts } from '@/lib/content/recent-posts'
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
- Lead with a strong hook — rotate styles (hot take, question, stat, confession, myth-bust). NEVER open with "Most teams", "Many companies", or similar generic B2B setups
- Hashtags: 0–2 max. Pick tags specific to THIS post's angle — brand keywords are for prose, not default hashtags. Zero hashtags is often best. Never slap the same single brand tag on every post
- Single tweet only — no thread`,

  reddit: `You are a Reddit content specialist. Write an authentic Reddit post.
- First line must be: Title: <your title here>
- Then a blank line
- Then the post body (100–500 characters)
- Plain text only in the body — no markdown, bullets, or bold
- Tone: Genuine, community-first, zero marketing speak — like someone typing fast, not a brand
- Include 2–3 subtle natural typos or grammar slips (missing comma, doubled word, casual "its/it's" mix-up). Do not mention the typos
- End with a question or invitation to discuss`,

  facebook: `You are a Facebook content specialist. Write an engaging Facebook post.
- Tone: Friendly, approachable, story-driven
- Length: 100–400 characters
- NEVER open with "Ever…", "Have you ever…", or similar rhetorical questions — rotate hook styles (story, bold claim, specific moment, tip)
- End with a question or call-to-action — vary the closing shape across posts
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
        brand.keywords?.length && `Brand themes (weave into copy naturally — not as default hashtags): ${brand.keywords.join(', ')}`,
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
      const [override, recentPosts] = await Promise.all([
        Promise.resolve(brand?.channel_overrides?.[channel]),
        fetchRecentChannelPosts(supabase, companyId, channel),
      ])
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
        NO_EM_DASH_RULE,
      ]
        .filter(Boolean)
        .join('\n\n')

      const userContent = `Write a ${channel} post about: ${topic}\n\n${buildChannelVarietyBlock(channel, recentPosts)}`

      const completion = await openai.chat.completions.create({
        model: 'gpt-5.4-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        max_completion_tokens: 800,
        temperature: 0.7,
      })

      const content = stripEmDashes(completion.choices[0].message.content ?? '')

      const { data: post, error } = await supabase
        .from('posts')
        .insert({
          company_id: companyId,
          channel,
          status: 'draft',
          content,
          ai_generated: true,
          generation_params: { topic, model: 'gpt-5.4-mini' },
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
