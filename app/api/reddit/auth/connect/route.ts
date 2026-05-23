import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildRedditAuthUrl } from '@/lib/reddit/oauth'
import { randomBytes } from 'crypto'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = req.nextUrl.searchParams.get('companyId')
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .single()

  if (!company) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const state = randomBytes(16).toString('hex')
    const authUrl = buildRedditAuthUrl(state)
    const cookieOpts = { httpOnly: true, maxAge: 600, sameSite: 'lax' as const, path: '/' }
    const res = NextResponse.redirect(authUrl)
    res.cookies.set('reddit_oauth_state', state, cookieOpts)
    res.cookies.set('reddit_company_id', companyId, cookieOpts)
    return res
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Reddit OAuth not configured'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
