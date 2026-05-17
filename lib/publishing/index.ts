import type { Post, Channel } from '@/types/database'
import type { PublishResult } from './types'
import { publishToLinkedIn } from './linkedin'
import { publishToReddit } from './reddit'
import { publishToFacebook } from './facebook'
import { publishToX } from './x'

const adapters: Record<Channel, (post: Post) => Promise<PublishResult>> = {
  linkedin: publishToLinkedIn,
  reddit: publishToReddit,
  facebook: publishToFacebook,
  x: publishToX,
}

export async function publish(post: Post): Promise<PublishResult> {
  const adapter = adapters[post.channel as Channel]
  if (!adapter) throw new Error(`No publishing adapter for channel: ${post.channel}`)
  return adapter(post)
}
