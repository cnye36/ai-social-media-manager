import { NextRequest, NextResponse } from 'next/server'
import { fetchNewPosts } from '@/lib/reddit/fetch-posts'
import { runMonitors } from '@/lib/reddit/monitor'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = req.nextUrl.searchParams.get('companyId') ?? undefined

  // ?probe=automation — sanity check: fetch posts from public RSS
  const probe = req.nextUrl.searchParams.get('probe')
  if (probe) {
    const sub = probe.replace(/^r\//, '').trim()
    const result = await fetchNewPosts(sub)
    if (!result.ok) {
      return NextResponse.json({ sub, ...result }, { status: 502 })
    }
    return NextResponse.json({
      sub,
      source: result.source,
      count: result.posts.length,
      sample: result.posts.slice(0, 3).map(p => ({
        name: p.name,
        title: p.title,
        posted_at: p.created_utc > 0 ? new Date(p.created_utc * 1000).toISOString() : null,
        selftext: p.selftext.slice(0, 200),
      })),
    })
  }

  try {
    const result = await runMonitors(companyId)
    return NextResponse.json(result)
  } catch (err) {
    console.error('Reddit monitor error:', err)
    return NextResponse.json({ error: 'Monitor run failed' }, { status: 500 })
  }
}
