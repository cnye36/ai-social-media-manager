import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { publishDueContent } from '@/lib/publishing/publish-due'
import { runMonitors } from '@/lib/reddit/monitor'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Single external-cron entry point (e.g. system crontab on a VPS).
 * Marks overdue scheduled posts as published, then runs Reddit monitors.
 * Buffer scheduling is handled separately by /api/cron/schedule-buffer (runs once daily).
 */
export async function GET(request: Request) {
  const auth = request.headers.get('Authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  try {
    const publish = await publishDueContent(supabase)
    const reddit = await runMonitors()

    return NextResponse.json({ publish, reddit })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cron tick failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
