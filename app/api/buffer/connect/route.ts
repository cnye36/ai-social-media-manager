import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/buffer/connect?companyId=xxx
// Redirects to Buffer OAuth. Requires BUFFER_CLIENT_ID env var.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const clientId = process.env.BUFFER_CLIENT_ID
  if (!clientId) {
    return NextResponse.json(
      { error: 'BUFFER_CLIENT_ID not configured. Use the access token method instead.' },
      { status: 501 }
    )
  }

  const companyId = req.nextUrl.searchParams.get('companyId')
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

  const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin
  const redirectUri = `${appUrl}/api/buffer/callback`

  const authUrl = new URL('https://bufferapp.com/oauth2/authorize')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('state', companyId)

  return NextResponse.redirect(authUrl.toString())
}
