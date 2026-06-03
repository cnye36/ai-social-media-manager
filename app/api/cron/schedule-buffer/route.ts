import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { publishViaBuffer, getBufferIntegration } from '@/lib/publishing/buffer'
import type { Post, Channel } from '@/types/database'

export const runtime = 'nodejs'
export const maxDuration = 60

const BUFFER_CHANNELS = new Set<Channel>(['linkedin', 'x', 'facebook'])

/**
 * Daily cron — push all scheduled posts for the next 24 hours to Buffer.
 * Run once every morning (e.g. "0 7 * * *") from your system crontab:
 *
 *   0 7 * * * curl -fsS -m 60 -H "Authorization: Bearer $CRON_SECRET" \
 *     "https://<your-domain>/api/cron/schedule-buffer"
 *
 * Posts are only pushed once (buffer_post_id guards against duplicates).
 * Buffer then publishes each post at the scheduled time automatically.
 */
export async function GET(request: Request) {
  const auth = request.headers.get('Authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date()
  const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  // Find all scheduled posts in the next 24h that haven't been pushed to Buffer yet
  const { data: posts, error } = await supabase
    .from('posts')
    .select('*')
    .eq('status', 'scheduled')
    .is('buffer_post_id', null)
    .gte('scheduled_for', now.toISOString())
    .lte('scheduled_for', windowEnd.toISOString())
    .order('scheduled_for', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!posts?.length) {
    return NextResponse.json({ scheduled: 0, failed: 0, skipped: 0 })
  }

  // Cache integrations per company to avoid repeated DB reads
  const integrationCache = new Map<string, Awaited<ReturnType<typeof getBufferIntegration>>>()

  let scheduled = 0
  let failed = 0
  let skipped = 0
  const failures: Array<{ postId: string; channel: string; error: string }> = []

  for (const post of posts as Post[]) {
    if (!BUFFER_CHANNELS.has(post.channel)) {
      skipped++
      continue
    }

    // Load integration once per company
    if (!integrationCache.has(post.company_id)) {
      integrationCache.set(post.company_id, await getBufferIntegration(post.company_id))
    }
    const integration = integrationCache.get(post.company_id)

    if (!integration) { skipped++; continue }

    const hasProfile = integration.profiles.some(p => p.channel === post.channel)
    if (!hasProfile) { skipped++; continue }

    try {
      const result = await publishViaBuffer(post)
      if (!result.platformPostId) {
        throw new Error('Buffer accepted the post but returned no ID')
      }

      await supabase
        .from('posts')
        .update({ buffer_post_id: result.platformPostId })
        .eq('id', post.id)

      scheduled++
    } catch (err) {
      failed++
      failures.push({
        postId: post.id,
        channel: post.channel,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return NextResponse.json({ scheduled, failed, skipped, ...(failures.length ? { failures } : {}) })
}
