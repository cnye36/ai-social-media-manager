import { NextRequest, NextResponse } from 'next/server'
import { runMonitors } from '@/lib/reddit/monitor'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = req.nextUrl.searchParams.get('companyId') ?? undefined

  // ?probe=r/subredditname — quick sanity check: fetch 5 posts from one subreddit and return them
  const probe = req.nextUrl.searchParams.get('probe')
  if (probe) {
    const sub = probe.replace(/^r\//, '')
    const res = await fetch(`https://www.reddit.com/r/${sub}/new.json?limit=5`, {
      headers: { 'User-Agent': 'social-media-manager/1.0 (by /u/your_reddit_username)' },
      cache: 'no-store',
    })
    const body = await res.text()
    return NextResponse.json({ status: res.status, sub, body: JSON.parse(body) })
  }

  try {
    const result = await runMonitors(companyId)
    return NextResponse.json(result)
  } catch (err) {
    console.error('Reddit monitor error:', err)
    return NextResponse.json({ error: 'Monitor run failed' }, { status: 500 })
  }
}
