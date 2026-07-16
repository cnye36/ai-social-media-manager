import type { PostIdea } from '@/app/api/generate/ideas/route'
import type { GeneratedPost } from '@/types/agents'

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
