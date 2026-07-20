import type { Post, MediaItem } from '@/types/database'
import type { ThreadTweet } from '@/types/agents'

/** Join separator used when persisting multi-tweet threads to `post.content`. */
export const X_THREAD_CONTENT_SEPARATOR = '\n\n---\n\n'

/** Buffer GraphQL asset shape for image/video attachments. */
export type BufferImageAsset = { image: { url: string } } | { video: { url: string } }

function threadFromVariants(contentVariants: Record<string, unknown>): unknown[] | null {
  const thread = contentVariants.thread
  if (!Array.isArray(thread) || thread.length === 0) return null
  return thread
}

/** True when an X post is a multi-tweet thread (not a single tweet). */
export function isXThreadPost(post: Post): boolean {
  if (post.channel !== 'x') return false
  const count = threadFromVariants(post.content_variants ?? {})?.length ?? 0
  if (count >= 2) return true
  return post.content.includes(X_THREAD_CONTENT_SEPARATOR)
}

/** Number of tweets in an X thread, or null when not a thread. */
export function xThreadTweetCount(post: Post): number | null {
  if (!isXThreadPost(post)) return null
  const thread = threadFromVariants(post.content_variants ?? {})
  if (thread) return thread.length
  return post.content.split(X_THREAD_CONTENT_SEPARATOR).length
}

function normalizeThreadTweet(raw: unknown): ThreadTweet {
  if (typeof raw === 'string') return { text: raw }
  const t = raw as ThreadTweet
  return {
    text: t.text ?? '',
    ...(t.imagePrompt ? { imagePrompt: t.imagePrompt } : {}),
    ...(t.media?.url ? { media: t.media } : {}),
  }
}

/** Map tweet index → media from `content_variants.thread` and indexed `media_items`. */
export function resolveThreadMediaByIndex(post: Post): Map<number, MediaItem> {
  const map = new Map<number, MediaItem>()

  const raw = post.content_variants?.thread
  if (Array.isArray(raw)) {
    raw.forEach((item, i) => {
      const tweet = normalizeThreadTweet(item)
      if (tweet.media?.url) map.set(i, tweet.media)
    })
  }

  for (const item of post.media_items ?? []) {
    if (!item.url) continue
    if (typeof item.tweet_index === 'number') {
      map.set(item.tweet_index, item)
    }
  }

  // Legacy: single post-level image with no per-tweet assignment → first tweet
  if (map.size === 0 && post.media_items?.length === 1 && post.media_items[0].url) {
    map.set(0, post.media_items[0])
  }

  return map
}

/** Parsed thread tweets with media merged from all storage locations. */
export function parseThreadTweets(post: Post): ThreadTweet[] {
  const mediaByIndex = resolveThreadMediaByIndex(post)
  const raw = threadFromVariants(post.content_variants ?? {})

  if (raw) {
    return raw.map((item, i) => {
      const tweet = normalizeThreadTweet(item)
      const media = mediaByIndex.get(i)
      return media ? { ...tweet, media } : tweet
    })
  }

  if (post.content.includes(X_THREAD_CONTENT_SEPARATOR)) {
    return post.content.split(X_THREAD_CONTENT_SEPARATOR).map((text, i) => {
      const trimmed = text.trim()
      const media = mediaByIndex.get(i)
      return media ? { text: trimmed, media } : { text: trimmed }
    })
  }

  return []
}

export function mediaToBufferAssets(media?: MediaItem): BufferImageAsset[] {
  if (!media?.url) return []
  return media.type === 'video' ? [{ video: { url: media.url } }] : [{ image: { url: media.url } }]
}

export interface XThreadBufferPayload {
  text: string
  assets: BufferImageAsset[]
  metadata: { twitter: { thread: Array<{ text: string; assets: BufferImageAsset[] }> } }
}

/**
 * Build Buffer CreatePostInput fields for an X thread.
 * Buffer requires every tweet (including the first) in metadata.twitter.thread;
 * top-level `text` + `assets` must mirror the first thread entry.
 * @see https://developers.buffer.com/examples/create-threaded-post
 */
export function buildXThreadBufferPayload(post: Post): XThreadBufferPayload | null {
  const tweets = parseThreadTweets(post)
  if (tweets.length < 2) return null

  const thread = tweets.map(t => ({
    text: t.text,
    assets: mediaToBufferAssets(t.media),
  }))

  return {
    text: thread[0].text,
    assets: thread[0].assets,
    metadata: {
      twitter: { thread },
    },
  }
}

/** Flatten per-tweet media into `media_items` with tweet_index for storage. */
export function threadMediaToPostItems(tweets: ThreadTweet[]): MediaItem[] {
  return tweets.flatMap((t, i) =>
    t.media?.url ? [{ ...t.media, tweet_index: i }] : [],
  )
}
