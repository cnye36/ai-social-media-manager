import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { isValidSignupInvite, SIGNUP_INVITE_COOKIE } from '@/lib/auth/signup-invite'

export async function POST(request: Request) {
  const body = await request.json()
  const inviteCode = typeof body.inviteCode === 'string' ? body.inviteCode : ''

  if (!isValidSignupInvite(inviteCode)) {
    return NextResponse.json({ error: 'Invalid invite code' }, { status: 403 })
  }

  const cookieStore = await cookies()
  cookieStore.set(SIGNUP_INVITE_COOKIE, '1', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  return NextResponse.json({ ok: true })
}
