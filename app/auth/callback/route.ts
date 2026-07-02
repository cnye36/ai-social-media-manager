import { isNewSignup, SIGNUP_INVITE_COOKIE } from '@/lib/auth/signup-invite'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

function siteOrigin(request: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  return new URL(request.url).origin
}

export async function GET(request: Request) {
  const origin = siteOrigin(request)
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user && isNewSignup(user)) {
        const cookieStore = await cookies()
        const verified = cookieStore.get(SIGNUP_INVITE_COOKIE)?.value === '1'
        if (!verified) {
          await supabase.auth.signOut()
          return NextResponse.redirect(`${origin}/login?error=invite_required`)
        }
        cookieStore.delete(SIGNUP_INVITE_COOKIE)
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
