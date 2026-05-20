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

  try {
    const result = await runMonitors(companyId)
    return NextResponse.json(result)
  } catch (err) {
    console.error('Reddit monitor error:', err)
    return NextResponse.json({ error: 'Monitor run failed' }, { status: 500 })
  }
}
