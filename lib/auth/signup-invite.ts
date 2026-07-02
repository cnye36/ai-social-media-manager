import { timingSafeEqual } from 'crypto'

export const SIGNUP_INVITE_COOKIE = 'signup_invite_verified'

export function isValidSignupInvite(code: string): boolean {
  const expected = process.env.SIGNUP_INVITE_CODE
  if (!expected || !code) return false

  const provided = Buffer.from(code)
  const secret = Buffer.from(expected)
  if (provided.length !== secret.length) return false

  return timingSafeEqual(provided, secret)
}

export function isNewSignup(user: { created_at: string; last_sign_in_at?: string | null }): boolean {
  const created = new Date(user.created_at).getTime()
  const lastSignIn = new Date(user.last_sign_in_at ?? user.created_at).getTime()
  return lastSignIn - created < 120_000
}
