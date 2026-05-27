import type { PostIdea } from '@/app/api/generate/ideas/route'
import type { GeneratedPost } from '@/types/agents'
import type { Channel } from '@/types/database'

export function postHasThread(post: GeneratedPost): boolean {
  const thread = post.contentVariants?.thread
  return Array.isArray(thread) && thread.length > 0
}

/** Heuristic + API hint: idea is meant to become an X thread, not a single tweet. */
export function ideaWantsThread(idea: PostIdea): boolean {
  if (idea.xFormat === 'thread') return true
  const text = `${idea.title} ${idea.description}`.toLowerCase()
  return /\b(thread|🧵|multi-?tweet|tweet series|tweetstorm|x thread|step[s-]? by step|breakdown|numbered)\b/.test(text)
}

/** Whether X generation for this run should use thread mode. */
export function resolveXThreadMode(
  channels: Channel[],
  threadModeToggle: boolean,
  idea?: PostIdea,
): boolean {
  if (!channels.includes('x')) return false
  if (threadModeToggle) return true
  if (idea && ideaWantsThread(idea)) return true
  return false
}
