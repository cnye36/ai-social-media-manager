import { getBufferIntegration, publishViaBuffer } from '@/lib/publishing/buffer'
import type { Channel, Post } from '@/types/database'

const BUFFER_CHANNELS = new Set<Channel>(['linkedin', 'x', 'facebook'])

/** Manual Buffer push only — requires a scheduled time (custom schedule, not Buffer queue). */
export async function scheduleViaBufferIfConnected(post: Post): Promise<Record<string, unknown>> {
  if (!BUFFER_CHANNELS.has(post.channel)) return {}

  if (!post.scheduled_for) {
    throw new Error('Set a publish date and time before sending to Buffer.')
  }

  if (post.buffer_post_id) {
    throw new Error('This post is already in Buffer.')
  }

  const integration = await getBufferIntegration(post.company_id)
  if (!integration) return {}

  const hasProfile = integration.profiles.some(profile => profile.channel === post.channel)
  if (!hasProfile) return {}

  const result = await publishViaBuffer(post, { requireCustomSchedule: true })
  if (!result.platformPostId) {
    throw new Error('Buffer accepted the request but did not return a post id. Check Buffer before retrying.')
  }

  return {
    buffer_post_id: result.platformPostId,
    ...(result.scheduledFor ? { scheduled_for: result.scheduledFor } : {}),
  }
}
