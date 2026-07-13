import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { retrieve } from '@/lib/rag/retrieve'
import { NO_EM_DASH_RULE, stripEmDashes } from '@/lib/content/no-em-dash'
import { buildChannelVarietyBlock } from '@/lib/content/channel-variety'
import { fetchRecentChannelPosts } from '@/lib/content/recent-posts'
import { buildArticlePublicUrl, DEFAULT_BLOG_BASE_URL } from '@/lib/blog/article-url'
import type { Channel } from '@/types/database'

export const maxDuration = 60

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const LINK_NOTE = 'A link to the article will be appended automatically after your text — do not include any link, URL, or "link in bio" placeholder yourself.'

const CHANNEL_INSTRUCTIONS: Record<Channel, (xTextLimit: number) => string> = {
  linkedin: () => `Write a LinkedIn post promoting this article.
- Tone: Professional, thought-provoking, not salesy
- Length: 300–800 characters
- Hook with the key insight from the article, then invite readers to read more
- 3–5 relevant hashtags at the end
- ${LINK_NOTE}`,

  x: (xTextLimit) => `Write a tweet promoting this article.
- HARD LIMIT: ${xTextLimit} characters total for your text
- Lead with the most compelling takeaway or surprising stat — never open with "Most teams" or generic B2B setups
- Hashtags: 0–1 max, specific to this article's angle — not a default brand keyword tag
- ${LINK_NOTE}`,

  reddit: () => `Write a Reddit post to share this article authentically.
- First line must be: Title: <your title>
- Then a blank line, then the post body (100–300 characters)
- Tone: Genuine community member sharing something useful, zero marketing
- End with a question inviting discussion
- ${LINK_NOTE}`,

  facebook: () => `Write a Facebook post promoting this article.
- Tone: Warm, conversational, story-driven
- Length: 100–300 characters
- End with a question or call-to-action to read the article
- At most 1–2 emojis if they feel natural
- ${LINK_NOTE}`,
}

/** Twitter's 280-char hard limit, minus the appended URL and a separating space. */
function xTextLimit(articleUrl: string | null): number {
  if (!articleUrl) return 280
  return Math.max(50, 280 - articleUrl.length - 1)
}

function appendArticleLink(channel: Channel, content: string, articleUrl: string | null): string {
  if (!articleUrl) return content
  if (channel === 'x') {
    const limit = xTextLimit(articleUrl)
    const trimmed = content.length > limit ? content.slice(0, limit).trim() : content
    return `${trimmed} ${articleUrl}`
  }
  return `${content}\n\n${articleUrl}`
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

  const [{ data: brand }, chunks, { data: site }] = await Promise.all([
    supabase.from('brand_profiles').select('tone, voice_notes, target_audience, keywords, channel_overrides').eq('company_id', article.company_id).maybeSingle(),
    retrieve(article.company_id, article.title, 4, 0.3).catch(() => [] as Awaited<ReturnType<typeof retrieve>>),
    article.site_id
      ? supabase.from('blog_sites').select('base_url').eq('id', article.site_id).single()
      : Promise.resolve({ data: null as { base_url: string } | null }),
  ])

  const articleUrl = article.slug
    ? buildArticlePublicUrl(site?.base_url ?? DEFAULT_BLOG_BASE_URL, article.slug)
    : null

  const brandContext = [
    brand?.tone && `Brand tone: ${brand.tone}`,
    brand?.voice_notes && `Voice: ${brand.voice_notes}`,
    brand?.target_audience && `Audience: ${brand.target_audience}`,
    brand?.keywords?.length && `Brand themes (prose only, not default hashtags): ${brand.keywords.join(', ')}`,
  ].filter(Boolean).join('\n')

  const knowledgeContext = chunks.length
    ? '\n\nAdditional brand context:\n' + chunks.map(c => c.content).join('\n\n')
    : ''

  const results = await Promise.allSettled(
    channels.map(async (channel) => {
      const [override, recentPosts] = await Promise.all([
        Promise.resolve(brand?.channel_overrides?.[channel]),
        fetchRecentChannelPosts(supabase, article.company_id, channel),
      ])
      const overrideContext = [
        override?.tone && `Channel-specific tone: ${override.tone}`,
        override?.voice_notes && `Channel voice notes: ${override.voice_notes}`,
      ].filter(Boolean).join('\n')

      const systemPrompt = [
        CHANNEL_INSTRUCTIONS[channel](xTextLimit(articleUrl)),
        brandContext,
        overrideContext,
        knowledgeContext,
        NO_EM_DASH_RULE,
      ].filter(Boolean).join('\n\n')

      const userContent = `Article to promote:\n\n${articleContext}\n\n${buildChannelVarietyBlock(channel, recentPosts)}`

      const completion = await openai.chat.completions.create({
        model: 'gpt-5.4-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        max_completion_tokens: 600,
        temperature: 0.75,
      })
      const rawContent = stripEmDashes(completion.choices[0].message.content ?? '')
      const content = appendArticleLink(channel, rawContent, articleUrl)

      const { data: post, error } = await supabase
        .from('posts')
        .insert({
          company_id: article.company_id,
          channel,
          status: 'draft',
          content,
          ai_generated: true,
          content_variants: {},
          media_items: [],
          generation_params: { source: 'article', articleId: id, articleTitle: article.title, model: 'gpt-5.4-mini' },
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
