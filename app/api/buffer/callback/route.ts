import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { connectBufferMcp } from '@/lib/publishing/buffer'

// GET /api/buffer/callback?code=xxx&state=companyId
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.nextUrl.origin))

  const code = req.nextUrl.searchParams.get('code')
  const companyId = req.nextUrl.searchParams.get('state')
  const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin

  if (!code || !companyId) {
    return NextResponse.redirect(`${appUrl}/${companyId}/settings?tab=connections&error=buffer_auth_failed`)
  }

  try {
    const tokenRes = await fetch('https://api.bufferapp.com/1/oauth2/token.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     process.env.BUFFER_CLIENT_ID ?? '',
        client_secret: process.env.BUFFER_CLIENT_SECRET ?? '',
        redirect_uri:  `${appUrl}/api/buffer/callback`,
        code,
        grant_type:    'authorization_code',
      }).toString(),
    })
    const tokenData = await tokenRes.json() as { access_token?: string; error?: string }
    if (!tokenData.access_token) throw new Error(tokenData.error ?? 'Token exchange failed')

    const bufferResult = await connectBufferMcp(tokenData.access_token)

    await supabase.from('buffer_integrations').upsert({
      company_id: companyId,
      access_token: tokenData.access_token,
      profiles: bufferResult.profiles,
      connected_at: new Date().toISOString(),
    })
  } catch {
    return NextResponse.redirect(`${appUrl}/${companyId}/settings?tab=connections&error=buffer_auth_failed`)
  }

  return NextResponse.redirect(`${appUrl}/${companyId}/settings?tab=connections`)
}
