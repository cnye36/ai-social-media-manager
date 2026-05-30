import { createAdminClient } from '@/lib/supabase/admin'
import { publishViaBuffer, getBufferIntegration } from './buffer'
import type { Post, Channel } from '@/types/database'

const BUFFER_CHANNELS: Channel[] = ['linkedin', 'x', 'facebook']
const BUFFER_QUEUE_LIMIT = 10

export interface FillResult {
  queued: number
  failed: number
  byChannel: Record<string, { queued: number; available: number }>
}

/**
 * For every company with a Buffer integration, fill each channel's queue
 * up to BUFFER_QUEUE_LIMIT by pushing the next scheduled posts.
 * Runs after publishDueContent so freshly freed slots are refilled immediately.
 */
export async function fillBufferQueues(companyId?: string): Promise<FillResult> {
  const supabase = createAdminClient()
  const now = new Date().toISOString()

  // Get all companies that have a Buffer integration
  let integrationsQuery = supabase
    .from('buffer_integrations')
    .select('company_id, access_token, organization_id, profiles')

  if (companyId) integrationsQuery = integrationsQuery.eq('company_id', companyId)

  const { data: integrations, error } = await integrationsQuery
  if (error || !integrations?.length) return { queued: 0, failed: 0, byChannel: {} }

  let totalQueued = 0
  let totalFailed = 0
  const byChannel: Record<string, { queued: number; available: number }> = {}

  for (const integration of integrations) {
    const cid = integration.company_id as string
    const profiles = (integration.profiles ?? []) as Array<{ channel: Channel; id: string }>

    for (const channel of BUFFER_CHANNELS) {
      const hasProfile = profiles.some(p => p.channel === channel)
      if (!hasProfile) continue

      const key = `${cid}:${channel}`

      // Count posts already in Buffer's queue (not yet published)
      const { count: inQueueCount } = await supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', cid)
        .eq('channel', channel)
        .eq('status', 'scheduled')
        .not('buffer_post_id', 'is', null)
        .gt('scheduled_for', now)

      const inQueue = inQueueCount ?? 0
      const available = Math.max(0, BUFFER_QUEUE_LIMIT - inQueue)

      byChannel[key] = { queued: 0, available }

      if (available === 0) continue

      // Get next posts to push (scheduled but not yet in Buffer, future)
      const { data: pendingPosts } = await supabase
        .from('posts')
        .select('*')
        .eq('company_id', cid)
        .eq('channel', channel)
        .eq('status', 'scheduled')
        .is('buffer_post_id', null)
        .gt('scheduled_for', now)
        .order('scheduled_for', { ascending: true })
        .limit(available)

      if (!pendingPosts?.length) continue

      for (const post of pendingPosts as Post[]) {
        try {
          const result = await publishViaBuffer(post)
          if (result.success && result.platformPostId) {
            await supabase
              .from('posts')
              .update({ buffer_post_id: result.platformPostId })
              .eq('id', post.id)

            totalQueued++
            byChannel[key].queued++
          }
        } catch {
          totalFailed++
        }
      }
    }
  }

  return { queued: totalQueued, failed: totalFailed, byChannel }
}

/** Per-channel queue depth for a single company (reads local DB, no Buffer API call). */
export async function getBufferQueueStatus(companyId: string): Promise<
  Record<Channel, { inQueue: number; pending: number; limit: number }>
> {
  const supabase = createAdminClient()
  const now = new Date().toISOString()

  const integration = await getBufferIntegration(companyId)
  const profiles = (integration?.profiles ?? []) as Array<{ channel: Channel }>
  const connectedChannels = new Set(profiles.map(p => p.channel))

  const result = {} as Record<Channel, { inQueue: number; pending: number; limit: number }>

  for (const channel of BUFFER_CHANNELS) {
    if (!connectedChannels.has(channel)) continue

    const [{ count: inQueue }, { count: pending }] = await Promise.all([
      supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('channel', channel)
        .eq('status', 'scheduled')
        .not('buffer_post_id', 'is', null)
        .gt('scheduled_for', now),
      supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('channel', channel)
        .eq('status', 'scheduled')
        .is('buffer_post_id', null)
        .gt('scheduled_for', now),
    ])

    result[channel] = {
      inQueue: inQueue ?? 0,
      pending: pending ?? 0,
      limit: BUFFER_QUEUE_LIMIT,
    }
  }

  return result
}
