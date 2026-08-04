import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { publishDueContent } from '@/lib/publishing/publish-due'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Single external-cron entry point (e.g. system crontab on a VPS).
 * Marks overdue scheduled posts as published.
 * Reddit monitoring is manual-only, triggered from the Reddit page UI.
 * Buffer is not called here — posts are sent to Buffer manually from the UI.
 */
export async function GET(request: Request) {
  const auth = request.headers.get('Authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  try {
    const publish = await publishDueContent(supabase)

    return NextResponse.json({ publish })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cron tick failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
