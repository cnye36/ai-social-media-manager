import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { exchangeRedditCode, saveRedditAccount } from '@/lib/reddit/oauth'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  const storedState = req.cookies.get('reddit_oauth_state')?.value
  const companyId = req.cookies.get('reddit_company_id')?.value ?? ''

  const redirectBase = companyId
    ? `/${companyId}/settings?tab=connections`
    : '/settings?tab=connections'

  function redirectWithError(msg: string) {
    const res = NextResponse.redirect(
      new URL(`${redirectBase}&reddit_error=${encodeURIComponent(msg)}`, req.url),
    )
    res.cookies.delete('reddit_oauth_state')
    res.cookies.delete('reddit_company_id')
    return res
  }

  if (error) return redirectWithError(error)
  if (!state || state !== storedState) return redirectWithError('invalid_state')
  if (!code) return redirectWithError('no_code')
  if (!companyId) return redirectWithError('missing_company')

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .single()

  if (!company) return redirectWithError('forbidden')

  try {
    const tokens = await exchangeRedditCode(code)
    await saveRedditAccount(companyId, tokens)

    const res = NextResponse.redirect(
      new URL(`${redirectBase}&reddit_connected=1`, req.url),
    )
    res.cookies.delete('reddit_oauth_state')
    res.cookies.delete('reddit_company_id')
    return res
  } catch (err) {
    console.error('[reddit-callback]', err)
    return redirectWithError('token_exchange_failed')
  }
}
