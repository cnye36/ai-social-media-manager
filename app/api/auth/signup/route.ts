import { NextResponse } from 'next/server'
import { isValidSignupInvite } from '@/lib/auth/signup-invite'
import { createClient } from '@/lib/supabase/server'
import { getSiteUrl } from '@/lib/site-url'

export async function POST(request: Request) {
  const body = await request.json()
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const inviteCode = typeof body.inviteCode === 'string' ? body.inviteCode : ''

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }

  if (!isValidSignupInvite(inviteCode)) {
    return NextResponse.json({ error: 'Invalid invite code' }, { status: 403 })
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${getSiteUrl()}/auth/callback` },
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
