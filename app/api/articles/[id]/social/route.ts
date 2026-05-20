import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { retrieve } from '@/lib/rag/retrieve'
import type { Channel } from '@/types/database'

export const maxDuration = 60

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const CHANNEL_INSTRUCTIONS: Record<Channel, string> = {
  linkedin: `Write a LinkedIn post promoting this article.
- Tone: Professional, thought-provoking, not salesy
- Length: 300–800 characters
- Hook with the key insight from the article, then invite readers to read more
- 3–5 relevant hashtags at the end`,

  x: `Write a tweet promoting this article.
- HARD LIMIT: 280 characters total
- Lead with the most compelling takeaway or surprising stat from the article
- Include 1 relevant hashtag
- Do NOT include a URL (it will be added separately)`,

  reddit: `Write a Reddit post to share this article authentically.
- First line must be: Title: <your title>
- Then a blank line, then the post body (100–300 characters)
- Tone: Genuine community member sharing something useful, zero marketing
- End with a question inviting discussion`,

  facebook: `Write a Facebook post promoting this article.
- Tone: Warm, conversational, story-driven
- Length: 100–300 characters
- End with a question or call-to-action to read the article
- At most 1–2 emojis if they feel natural`,
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { channels } = body as { channels: Channel[] }
  if (!channels?.length) return NextResponse.json({ error: 'channels required' }, { status: 400 })

  const { data: article } = await supabase
    .from('articles')
    .select('*')
    .eq('id', id)
    .single()
  if (!article) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('id', article.company_id)
    .eq('owner_id', user.id)
    .single()
  if (!company) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const articleContext = [article.title, article.excerpt, article.body.slice(0, 800)]
    .filter(Boolean)
    .join('\n\n')

  const [{ data: brand }, chunks] = await Promise.all([
    supabase.from('brand_profiles').select('tone, voice_notes, target_audience, keywords').eq('company_id', article.company_id).maybeSingle(),
    retrieve(article.company_id, article.title, 4, 0.3).catch(() => [] as Awaited<ReturnType<typeof retrieve>>),
  ])

  const brandContext = [
    brand?.tone && `Brand tone: ${brand.tone}`,
    brand?.voice_notes && `Voice: ${brand.voice_notes}`,
    brand?.target_audience && `Audience: ${brand.target_audience}`,
    brand?.keywords?.length && `Keywords: ${brand.keywords.join(', ')}`,
  ].filter(Boolean).join('\n')

  const knowledgeContext = chunks.length
    ? '\n\nAdditional brand context:\n' + chunks.map(c => c.content).join('\n\n')
    : ''

  const results = await Promise.allSettled(
    channels.map(async (channel) => {
      const systemPrompt = [CHANNEL_INSTRUCTIONS[channel], brandContext, knowledgeContext].filter(Boolean).join('\n\n')
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Article to promote:\n\n${articleContext}` },
        ],
        max_tokens: 600,
        temperature: 0.75,
      })
      return { channel, content: completion.choices[0].message.content ?? '' }
    })
  )

  const drafts = results
    .filter((r): r is PromiseFulfilledResult<{ channel: Channel; content: string }> => r.status === 'fulfilled')
    .map(r => r.value)

  return NextResponse.json({ drafts })
}
