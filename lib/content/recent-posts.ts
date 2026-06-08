import type { SupabaseClient } from '@supabase/supabase-js'
import type { Channel, Post } from '@/types/database'

/** How many recent posts to compare against when writing new content. */
export const RECENT_POST_LOOKBACK = 3

const FETCH_BUFFER = 12

function postEffectiveTime(post: Pick<Post, 'published_at' | 'scheduled_for' | 'created_at'>): number {
  const raw = post.published_at ?? post.scheduled_for ?? post.created_at
  return raw ? new Date(raw).getTime() : 0
}

/** First sentence or line — used to detect repeated openers. */
export function extractOpeningLine(content: string): string {
  const trimmed = content.trim()
  if (!trimmed) return ''

  const firstLine = trimmed.split('\n')[0]?.trim() ?? ''
  const sentenceMatch = firstLine.match(/^[^.!?]+[.!?]?/)
  const opener = (sentenceMatch?.[0] ?? firstLine).trim()
  return opener.slice(0, 140)
}

function normalizeForComparison(text: string): string {
  return text.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim()
}

/** Pull the first 1–3 words — catches "Ever had", "Most teams", etc. */
export function extractOpeningPattern(content: string): string {
  const opener = extractOpeningLine(content)
  const words = opener.split(/\s+/).slice(0, 3)
  return words.join(' ')
}

export async function fetchRecentChannelPosts(
  supabase: SupabaseClient,
  companyId: string,
  channel: Channel,
  limit = RECENT_POST_LOOKBACK,
): Promise<Post[]> {
  const { data } = await supabase
    .from('posts')
    .select('id, channel, content, status, scheduled_for, published_at, created_at, content_variants')
    .eq('company_id', companyId)
    .eq('channel', channel)
    .in('status', ['published', 'scheduled', 'draft'])
    .order('created_at', { ascending: false })
    .limit(FETCH_BUFFER)

  return ((data ?? []) as Post[])
    .sort((a, b) => postEffectiveTime(b) - postEffectiveTime(a))
    .slice(0, limit)
}

export async function fetchRecentPostsByChannels(
  supabase: SupabaseClient,
  companyId: string,
  channels: Channel[],
  limitPerChannel = RECENT_POST_LOOKBACK,
): Promise<Record<Channel, Post[]>> {
  const entries = await Promise.all(
    channels.map(async channel => [
      channel,
      await fetchRecentChannelPosts(supabase, companyId, channel, limitPerChannel),
    ] as const),
  )
  return Object.fromEntries(entries) as Record<Channel, Post[]>
}

export function collectRecentOpeners(posts: Post[]): string[] {
  const seen = new Set<string>()
  const openers: string[] = []

  for (const post of posts) {
    const opener = extractOpeningLine(post.content)
    const key = normalizeForComparison(opener)
    if (opener && !seen.has(key)) {
      seen.add(key)
      openers.push(opener)
    }
  }

  return openers
}

export function buildRecentPostsVarietyBlock(
  channel: Channel,
  posts: Post[],
): string | null {
  if (posts.length === 0) return null

  const excerpts = posts.map((post, index) => {
    const opener = extractOpeningLine(post.content)
    const preview = post.content.replace(/\s+/g, ' ').slice(0, 220)
    const when = post.published_at ?? post.scheduled_for ?? post.created_at
    const date = when ? new Date(when).toISOString().slice(0, 10) : 'unknown'
    return `${index + 1}. (${date}, ${post.status}) Opening: "${opener}"
   Body preview: "${preview}${preview.length >= 220 ? '…' : ''}"`
  }).join('\n\n')

  const patterns = collectRecentOpeners(posts).map(o => `"${extractOpeningPattern(o)}"`)

  return [
    `RECENT ${channel.toUpperCase()} POSTS (your new post must NOT look like a clone of these):`,
    excerpts,
    '',
    'ANTI-REPETITION (mandatory):',
    '- Do NOT reuse the same opening word, phrase, or sentence structure as any post above.',
    patterns.length > 0
      ? `- Banned opening patterns for THIS post (already used recently): ${patterns.join(', ')}`
      : null,
    '- Vary rhythm, hook archetype, and closing question/CTA — not the same template with swapped nouns.',
    '- A human account would never publish three posts in a row that all start the same way. Neither should you.',
  ].filter(Boolean).join('\n')
}

export function buildIdeasRecentPostsSection(
  postsByChannel: Partial<Record<Channel, Post[]>>,
): string {
  const sections = (Object.entries(postsByChannel) as [Channel, Post[]][])
    .filter(([, posts]) => posts.length > 0)
    .map(([channel, posts]) => {
      const lines = posts.map((post, index) => {
        const opener = extractOpeningLine(post.content)
        return `  ${index + 1}. "${opener.slice(0, 100)}${opener.length > 100 ? '…' : ''}"`
      })
      return `${channel.toUpperCase()} — recent openers to AVOID repeating in new ideas:\n${lines.join('\n')}`
    })

  if (sections.length === 0) {
    return 'No recent posts on file yet — still maximize hook diversity across ideas.'
  }

  return [
    'RECENT POSTS BY CHANNEL (do not propose ideas that would lead to the same hooks/openers):',
    sections.join('\n\n'),
    '',
    'Each new idea must suggest a distinctly different angle AND opening style from the recent posts on its target channel.',
  ].join('\n')
}
