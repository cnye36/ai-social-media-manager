import type { Post } from '@/types/database'

/** Join separator used when persisting multi-tweet threads to `post.content`. */
export const X_THREAD_CONTENT_SEPARATOR = '\n\n---\n\n'

function threadFromVariants(contentVariants: Record<string, unknown>): unknown[] | null {
  const thread = contentVariants.thread
  if (!Array.isArray(thread) || thread.length === 0) return null
  return thread
}

/** True when an X post is a multi-tweet thread (not a single tweet). */
export function isXThreadPost(post: Post): boolean {
  if (post.channel !== 'x') return false
  if (threadFromVariants(post.content_variants ?? {})) return true
  return post.content.includes(X_THREAD_CONTENT_SEPARATOR)
}

/** Number of tweets in an X thread, or null when not a thread. */
export function xThreadTweetCount(post: Post): number | null {
  if (!isXThreadPost(post)) return null
  const thread = threadFromVariants(post.content_variants ?? {})
  if (thread) return thread.length
  return post.content.split(X_THREAD_CONTENT_SEPARATOR).length
}
