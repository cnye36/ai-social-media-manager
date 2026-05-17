import type { NextRequest } from 'next/server'

/** Canonical app origin for OAuth redirects (avoids Cursor forwarded ports). */
export function getSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  if (typeof window !== 'undefined') return window.location.origin
  return 'http://localhost:3000'
}

export function getCanonicalSiteOrigin(): string | null {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL
  if (!fromEnv) return null
  return new URL(fromEnv).origin
}

/** Origin the browser used (includes Cursor forwarded ports in Host / X-Forwarded-Host). */
export function getRequestOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get('x-forwarded-host')
  if (forwardedHost) {
    const proto = request.headers.get('x-forwarded-proto') ?? 'http'
    return `${proto}://${forwardedHost}`
  }
  return request.nextUrl.origin
}

export function canonicalRedirectUrl(
  request: NextRequest,
  canonicalOrigin: string
): URL {
  const path = `${request.nextUrl.pathname}${request.nextUrl.search}`
  return new URL(path, canonicalOrigin)
}
