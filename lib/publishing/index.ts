import type { Post, Channel } from '@/types/database'
import type { PublishResult } from './types'
import { publishToLinkedIn } from './linkedin'
import { publishToReddit } from './reddit'
import { publishToFacebook } from './facebook'
import { publishToX } from './x'
import { publishViaBuffer, getBufferIntegration } from './buffer'

const directAdapters: Record<Channel, (post: Post) => Promise<PublishResult>> = {
  linkedin: publishToLinkedIn,
  reddit:   publishToReddit,
  facebook: publishToFacebook,
  x:        publishToX,
}

export async function publish(post: Post): Promise<PublishResult> {
  // Prefer Buffer when the company has a matching profile connected
  const bufferIntegration = await getBufferIntegration(post.company_id)
  if (bufferIntegration) {
    const hasProfile = bufferIntegration.profiles.some(p => p.channel === post.channel)
    if (hasProfile) return publishViaBuffer(post)
  }

  // Fall back to direct platform adapter
  const adapter = directAdapters[post.channel as Channel]
  if (!adapter) throw new Error(`No publishing adapter for channel: ${post.channel}`)
  return adapter(post)
}
