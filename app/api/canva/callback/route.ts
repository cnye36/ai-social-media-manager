import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { exchangeCanvaCode, saveCanvaTokens } from '@/lib/media/canva'
import { getSiteUrl } from '@/lib/site-url'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  const storedState = req.cookies.get('canva_oauth_state')?.value
  const codeVerifier = req.cookies.get('canva_code_verifier')?.value
  const companyId = req.cookies.get('canva_company_id')?.value ?? ''

  const settingsBase = companyId
    ? `/${companyId}/settings?tab=connections`
    : '/settings?tab=connections'

  function redirectWithError(msg: string) {
    const res = NextResponse.redirect(new URL(`${settingsBase}&canva_error=${encodeURIComponent(msg)}`, req.url))
    res.cookies.delete('canva_oauth_state')
    res.cookies.delete('canva_code_verifier')
    res.cookies.delete('canva_company_id')
    return res
  }

  if (error) return redirectWithError(error)
  if (!state || state !== storedState) return redirectWithError('invalid_state')
  if (!code) return redirectWithError('no_code')
  if (!codeVerifier) return redirectWithError('missing_code_verifier')

  try {
    const origin = getSiteUrl()
    const redirectUri = `${origin}/api/canva/callback`
    const tokens = await exchangeCanvaCode({ code, redirectUri, codeVerifier })
    await saveCanvaTokens(user.id, tokens)

    const res = NextResponse.redirect(new URL(`${settingsBase}&canva_connected=1`, req.url))
    res.cookies.delete('canva_oauth_state')
    res.cookies.delete('canva_code_verifier')
    res.cookies.delete('canva_company_id')
    return res
  } catch (err) {
    console.error('[canva-callback]', err)
    return redirectWithError('token_exchange_failed')
  }
}
