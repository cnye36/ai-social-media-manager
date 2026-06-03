import { getBufferIntegration, publishViaBuffer } from '@/lib/publishing/buffer'
import type { Channel, Post } from '@/types/database'

const BUFFER_CHANNELS = new Set<Channel>(['linkedin', 'x', 'facebook'])

export async function scheduleViaBufferIfConnected(post: Post): Promise<Record<string, unknown>> {
  if (!BUFFER_CHANNELS.has(post.channel)) return {}

  const integration = await getBufferIntegration(post.company_id)
  if (!integration) return {}

  const hasProfile = integration.profiles.some(profile => profile.channel === post.channel)
  if (!hasProfile) return {}

  const result = await publishViaBuffer(post)
  if (!result.platformPostId) {
    throw new Error('Buffer accepted the request but did not return a post id. Check Buffer before retrying.')
  }

  return {
    buffer_post_id: result.platformPostId,
    ...(result.scheduledFor ? { scheduled_for: result.scheduledFor } : {}),
  }
}
