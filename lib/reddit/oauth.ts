import { createAdminClient } from '@/lib/supabase/admin'

export const REDDIT_USER_AGENT =
  process.env.REDDIT_USER_AGENT ??
  'web:social-media-manager:v1.0 (by /u/affinitybots)'

/** Read-only — monitors and stats only; replies are copied manually on reddit.com */
export const REDDIT_SCOPES = ['read', 'identity'] as const

export interface RedditTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  scope: string
  refresh_token?: string
}

export interface RedditAccountRow {
  id: string
  company_id: string
  reddit_username: string
  access_token: string
  refresh_token: string
  expires_at: string
  scope: string | null
}

function getClientCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.REDDIT_CLIENT_ID
  const clientSecret = process.env.REDDIT_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret }
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  const raw = `${clientId}:${clientSecret}`
  if (typeof btoa === 'function') return btoa(raw)
  return Buffer.from(raw).toString('base64')
}

export function getRedditRedirectUri(): string {
  const base = process.env.REDDIT_REDIRECT_URI?.replace(/\/$/, '')
  if (base) return `${base}/api/reddit/auth/callback`
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'http://localhost:3000'
  return `${site}/api/reddit/auth/callback`
}

export function buildRedditAuthUrl(state: string): string {
  const creds = getClientCredentials()
  if (!creds) throw new Error('REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET are required')

  const params = new URLSearchParams({
    client_id: creds.clientId,
    response_type: 'code',
    state,
    redirect_uri: getRedditRedirectUri(),
    duration: 'permanent',
    scope: REDDIT_SCOPES.join(' '),
  })
  return `https://www.reddit.com/api/v1/authorize?${params}`
}

async function requestRedditToken(body: URLSearchParams): Promise<RedditTokenResponse> {
  const creds = getClientCredentials()
  if (!creds) throw new Error('Reddit app credentials not configured')

  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuthHeader(creds.clientId, creds.clientSecret)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': REDDIT_USER_AGENT,
    },
    body: body.toString(),
    cache: 'no-store',
  })

  const text = await res.text()
  if (!res.ok) throw new Error(`Reddit token error ${res.status}: ${text.slice(0, 300)}`)

  return JSON.parse(text) as RedditTokenResponse
}

export async function exchangeRedditCode(code: string): Promise<RedditTokenResponse> {
  return requestRedditToken(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: getRedditRedirectUri(),
    }),
  )
}

export async function refreshRedditToken(refreshToken: string): Promise<RedditTokenResponse> {
  return requestRedditToken(
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  )
}

export async function fetchRedditUsername(accessToken: string): Promise<string> {
  const res = await fetch('https://oauth.reddit.com/api/v1/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': REDDIT_USER_AGENT,
    },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Reddit /me failed: ${res.status}`)
  const json = (await res.json()) as { name?: string }
  if (!json.name) throw new Error('Reddit /me returned no username')
  return json.name
}

let cachedAppToken: { token: string; expiresAt: number } | null = null

/** App-only token (no user context). Used when company has not connected Reddit. */
export async function getAppOnlyAccessToken(): Promise<string | null> {
  const creds = getClientCredentials()
  if (!creds) return null

  if (cachedAppToken && cachedAppToken.expiresAt > Date.now() + 60_000) {
    return cachedAppToken.token
  }

  const json = await requestRedditToken(
    new URLSearchParams({ grant_type: 'client_credentials' }),
  )

  cachedAppToken = {
    token: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  }
  return cachedAppToken.token
}

async function persistRefreshedTokens(
  accountId: string,
  tokens: RedditTokenResponse,
  existingRefresh: string,
): Promise<string> {
  const supabase = createAdminClient()
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()
  const { error } = await supabase
    .from('reddit_accounts')
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? existingRefresh,
      expires_at: expiresAt,
      scope: tokens.scope,
    })
    .eq('id', accountId)

  if (error) throw new Error(error.message)
  return tokens.access_token
}

/** Valid access token for a company (refreshes automatically). */
export async function getRedditAccessToken(companyId: string): Promise<string | null> {
  const supabase = createAdminClient()
  const { data: account } = await supabase
    .from('reddit_accounts')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle()

  if (!account) return getAppOnlyAccessToken()

  const expiresAt = new Date(account.expires_at).getTime()
  if (expiresAt > Date.now() + 60_000) return account.access_token

  const tokens = await refreshRedditToken(account.refresh_token)
  return persistRefreshedTokens(account.id, tokens, account.refresh_token)
}

export async function saveRedditAccount(
  companyId: string,
  tokens: RedditTokenResponse,
): Promise<RedditAccountRow> {
  const username = await fetchRedditUsername(tokens.access_token)
  if (!tokens.refresh_token) throw new Error('Reddit did not return a refresh token')

  const supabase = createAdminClient()
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  const { data, error } = await supabase
    .from('reddit_accounts')
    .upsert(
      {
        company_id: companyId,
        reddit_username: username,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
        scope: tokens.scope,
      },
      { onConflict: 'company_id' },
    )
    .select('*')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Failed to save Reddit account')
  return data as RedditAccountRow
}

export async function getRedditAccountStatus(companyId: string): Promise<{
  connected: boolean
  username?: string
}> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('reddit_accounts')
    .select('reddit_username')
    .eq('company_id', companyId)
    .maybeSingle()

  if (!data) return { connected: false }
  return { connected: true, username: data.reddit_username }
}

export async function deleteRedditAccount(companyId: string): Promise<void> {
  const supabase = createAdminClient()
  await supabase.from('reddit_accounts').delete().eq('company_id', companyId)
}

export async function redditApiFetch(
  path: string,
  companyId: string,
  init?: RequestInit,
): Promise<Response> {
  const token = await getRedditAccessToken(companyId)
  if (!token) throw new Error('Reddit is not connected and app credentials are missing')

  const url = path.startsWith('http') ? path : `https://oauth.reddit.com${path}`
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': REDDIT_USER_AGENT,
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  })
}
