import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { publishDueContent } from '@/lib/publishing/publish-due'
import { fillBufferQueues } from '@/lib/publishing/buffer-queue'
import { runMonitors } from '@/lib/reddit/monitor'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Single external-cron entry point (e.g. system crontab on a VPS).
 * Runs overdue publish first, then Reddit monitors.
 */
export async function GET(request: Request) {
  const auth = request.headers.get('Authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  try {
    const publish = await publishDueContent(supabase)
    // After marking posts published, refill freed Buffer queue slots
    const bufferFill = await fillBufferQueues()
    const reddit = await runMonitors()

    return NextResponse.json({ publish, bufferFill, reddit })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cron tick failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
