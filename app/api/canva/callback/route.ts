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

  if (error) {
    return NextResponse.redirect(new URL(`/settings?canva_error=${encodeURIComponent(error)}`, req.url))
  }

  // CSRF state validation
  const storedState = req.cookies.get('canva_oauth_state')?.value
  if (!state || state !== storedState) {
    return NextResponse.redirect(new URL('/settings?canva_error=invalid_state', req.url))
  }

  if (!code) {
    return NextResponse.redirect(new URL('/settings?canva_error=no_code', req.url))
  }

  try {
    const origin = getSiteUrl()
    const redirectUri = `${origin}/api/canva/callback`
    const tokens = await exchangeCanvaCode({ code, redirectUri })
    await saveCanvaTokens(user.id, tokens)

    const res = NextResponse.redirect(new URL('/settings?canva_connected=1', req.url))
    res.cookies.delete('canva_oauth_state')
    return res
  } catch (err) {
    console.error('[canva-callback]', err)
    return NextResponse.redirect(new URL(`/settings?canva_error=token_exchange_failed`, req.url))
  }
}
