import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildCanvaAuthUrl, generateCodeVerifier, generateCodeChallenge } from '@/lib/media/canva'
import { getSiteUrl } from '@/lib/site-url'
import { randomBytes } from 'crypto'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get('companyId') ?? ''

  const state = randomBytes(16).toString('hex')
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)

  const origin = getSiteUrl()
  const redirectUri = `${origin}/api/canva/callback`

  const clientId = process.env.CANVA_CLIENT_ID
  if (!clientId) return NextResponse.json({ error: 'CANVA_CLIENT_ID not configured' }, { status: 500 })

  const authUrl = buildCanvaAuthUrl({ clientId, redirectUri, state, codeChallenge })

  const cookieOpts = { httpOnly: true, maxAge: 600, sameSite: 'lax' as const, path: '/' }
  const res = NextResponse.redirect(authUrl)
  res.cookies.set('canva_oauth_state', state, cookieOpts)
  res.cookies.set('canva_code_verifier', codeVerifier, cookieOpts)
  res.cookies.set('canva_company_id', companyId, cookieOpts)
  return res
}
