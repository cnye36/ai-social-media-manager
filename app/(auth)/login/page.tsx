'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getSiteUrl } from '@/lib/site-url'

type Mode = 'signin' | 'signup'

const ERROR_MESSAGES: Record<string, string> = {
  invite_required: 'An invite code is required to create an account.',
  auth_failed: 'Authentication failed. Please try again.',
}

export default function LoginPage() {
  useEffect(() => {
    const site = process.env.NEXT_PUBLIC_SITE_URL
    if (!site) return
    const canonical = new URL(site).origin
    if (window.location.origin !== canonical) {
      window.location.replace(
        `${canonical}${window.location.pathname}${window.location.search}`
      )
    }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const errorCode = params.get('error')
    if (errorCode && ERROR_MESSAGES[errorCode]) {
      setError(ERROR_MESSAGES[errorCode])
    }
  }, [])

  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [signedUp, setSignedUp] = useState(false)

  async function verifyInviteCode(): Promise<boolean> {
    const res = await fetch('/api/auth/verify-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteCode }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Invalid invite code')
      return false
    }
    return true
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (mode === 'signup') {
      if (password !== confirmPassword) {
        setError('Passwords do not match')
        setLoading(false)
        return
      }

      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, inviteCode }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Sign up failed')
      } else {
        setSignedUp(true)
      }
    } else {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
      } else {
        window.location.href = '/'
      }
    }

    setLoading(false)
  }

  async function handleGoogle() {
    setError('')
    setLoading(true)

    if (mode === 'signup') {
      if (!inviteCode.trim()) {
        setError('Invite code is required to sign up')
        setLoading(false)
        return
      }
      const verified = await verifyInviteCode()
      if (!verified) {
        setLoading(false)
        return
      }
    }

    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${getSiteUrl()}/auth/callback` },
    })
    setLoading(false)
  }

  function switchMode(next: Mode) {
    setMode(next)
    setError('')
    setPassword('')
    setConfirmPassword('')
    setInviteCode('')
    setSignedUp(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="w-full max-w-md p-8 bg-zinc-900 rounded-2xl border border-zinc-800 shadow-xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Social Media Manager</h1>
          <p className="text-zinc-400 mt-1 text-sm">AI-powered content for every channel</p>
        </div>

        {signedUp ? (
          <div className="text-center py-6">
            <div className="text-4xl mb-3">📬</div>
            <p className="text-white font-medium">Confirm your email</p>
            <p className="text-zinc-400 text-sm mt-1">
              We sent a confirmation link to <strong>{email}</strong>
            </p>
            <button
              onClick={() => switchMode('signin')}
              className="mt-4 text-violet-400 text-sm hover:text-violet-300 transition-colors"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <button
              onClick={handleGoogle}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-white text-zinc-900 rounded-lg font-medium hover:bg-zinc-100 transition-colors disabled:opacity-50"
            >
              <GoogleIcon />
              Continue with Google
            </button>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-zinc-800" />
              <span className="text-zinc-500 text-xs">or</span>
              <div className="flex-1 h-px bg-zinc-800" />
            </div>

            <div className="flex rounded-lg overflow-hidden border border-zinc-700">
              <button
                onClick={() => switchMode('signin')}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  mode === 'signin'
                    ? 'bg-zinc-700 text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => switchMode('signup')}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  mode === 'signup'
                    ? 'bg-zinc-700 text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Sign Up
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Password"
                required
                minLength={6}
                className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
              {mode === 'signup' && (
                <>
                  <input
                    type="password"
                    value={inviteCode}
                    onChange={e => setInviteCode(e.target.value)}
                    placeholder="Invite code"
                    required
                    className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Confirm password"
                    required
                    minLength={6}
                    className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  />
                </>
              )}
              {error && (
                <p className="text-red-400 text-sm">{error}</p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-2.5 bg-violet-600 text-white rounded-lg font-medium hover:bg-violet-500 transition-colors disabled:opacity-50"
              >
                {loading
                  ? mode === 'signup' ? 'Creating account...' : 'Signing in...'
                  : mode === 'signup' ? 'Create Account' : 'Sign In'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}
