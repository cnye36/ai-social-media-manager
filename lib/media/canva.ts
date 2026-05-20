import { createAdminClient } from '@/lib/supabase/admin'
import { randomBytes, createHash } from 'crypto'

const CANVA_API_BASE = 'https://api.canva.com/rest/v1'
const CANVA_AUTH_URL = 'https://www.canva.com/api/oauth/authorize'
const CANVA_TOKEN_URL = 'https://api.canva.com/rest/v1/oauth/token'

export interface CanvaTokens {
  accessToken: string
  refreshToken?: string
  expiresAt?: Date
}

export interface CanvaAsset {
  assetId: string
  url: string
}

export interface CanvaDesign {
  designId: string
  editUrl: string
  viewUrl: string
}

// ── PKCE helpers ───────────────────────────────────────────────────────────────

export function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url')
}

export function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

// ── OAuth helpers ──────────────────────────────────────────────────────────────

export function buildCanvaAuthUrl(params: {
  clientId: string
  redirectUri: string
  state: string
  codeChallenge: string
}): string {
  const url = new URL(CANVA_AUTH_URL)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', params.clientId)
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('state', params.state)
  url.searchParams.set('scope', 'asset:read asset:write design:content:read design:content:write design:meta:read')
  url.searchParams.set('code_challenge', params.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

export async function exchangeCanvaCode(params: {
  code: string
  redirectUri: string
  codeVerifier: string
}): Promise<CanvaTokens> {
  const clientId = process.env.CANVA_CLIENT_ID!
  const clientSecret = process.env.CANVA_CLIENT_SECRET!

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
    code_verifier: params.codeVerifier,
  })

  const res = await fetch(CANVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Canva token exchange failed: ${text}`)
  }

  const data = await res.json()
  return tokensFromResponse(data)
}

async function refreshCanvaToken(refreshToken: string): Promise<CanvaTokens> {
  const clientId = process.env.CANVA_CLIENT_ID!
  const clientSecret = process.env.CANVA_CLIENT_SECRET!

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  })

  const res = await fetch(CANVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Canva token refresh failed: ${text}`)
  }

  const data = await res.json()
  return tokensFromResponse(data)
}

function tokensFromResponse(data: Record<string, unknown>): CanvaTokens {
  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600
  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string | undefined,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
  }
}

// ── Token storage ──────────────────────────────────────────────────────────────

export async function saveCanvaTokens(userId: string, tokens: CanvaTokens): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.from('user_integrations').upsert(
    {
      user_id: userId,
      provider: 'canva',
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken ?? null,
      expires_at: tokens.expiresAt?.toISOString() ?? null,
    },
    { onConflict: 'user_id,provider' }
  )
  if (error) throw new Error(`Failed to save Canva tokens: ${error.message}`)
}

export async function getCanvaTokens(userId: string): Promise<CanvaTokens | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('user_integrations')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .eq('provider', 'canva')
    .maybeSingle()

  if (error || !data) return null

  const tokens: CanvaTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? undefined,
    expiresAt: data.expires_at ? new Date(data.expires_at) : undefined,
  }

  // Auto-refresh if expiring within 5 minutes
  if (tokens.expiresAt && tokens.expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
    if (!tokens.refreshToken) return null
    const fresh = await refreshCanvaToken(tokens.refreshToken)
    await saveCanvaTokens(userId, fresh)
    return fresh
  }

  return tokens
}

// ── Canva API calls ────────────────────────────────────────────────────────────

async function canvaFetch(
  path: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<Response> {
  const res = await fetch(`${CANVA_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  })
  return res
}

/**
 * Upload a PNG buffer as a Canva asset.
 */
export async function uploadAssetToCanva(params: {
  userId: string
  imageBuffer: Buffer
  name: string
}): Promise<CanvaAsset> {
  const tokens = await getCanvaTokens(params.userId)
  if (!tokens) throw new Error('No Canva connection found. Please connect Canva first.')

  // Step 1: create upload job
  const createRes = await canvaFetch('/asset-uploads', tokens.accessToken, {
    method: 'POST',
    body: JSON.stringify({
      name: params.name,
      type: 'image/png',
    }),
  })

  if (!createRes.ok) {
    const text = await createRes.text()
    throw new Error(`Canva asset upload init failed: ${text}`)
  }

  const { job } = await createRes.json()
  const uploadUrl: string = job.upload_url

  // Step 2: PUT the binary data to the pre-signed URL
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/png' },
    body: new Uint8Array(params.imageBuffer),
  })

  if (!putRes.ok) {
    throw new Error(`Canva asset binary upload failed: ${putRes.status}`)
  }

  // Step 3: poll until asset is ready
  const assetId: string = job.asset_id
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 1500))
    const statusRes = await canvaFetch(`/asset-uploads/${job.id}`, tokens.accessToken)
    if (!statusRes.ok) continue
    const { job: statusJob } = await statusRes.json()
    if (statusJob.status === 'success') {
      return { assetId, url: statusJob.asset?.url ?? '' }
    }
    if (statusJob.status === 'failed') {
      throw new Error('Canva asset processing failed')
    }
  }

  throw new Error('Canva asset upload timed out')
}

/**
 * Create a blank Canva design pre-populated with an uploaded asset.
 */
export async function createCanvaDesignFromAsset(params: {
  userId: string
  assetId: string
  title: string
}): Promise<CanvaDesign> {
  const tokens = await getCanvaTokens(params.userId)
  if (!tokens) throw new Error('No Canva connection found.')

  const res = await canvaFetch('/designs', tokens.accessToken, {
    method: 'POST',
    body: JSON.stringify({
      design_type: { type: 'preset', name: 'SocialMedia' },
      asset_id: params.assetId,
      title: params.title,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Canva design creation failed: ${text}`)
  }

  const { design } = await res.json()
  return {
    designId: design.id,
    editUrl: design.urls?.edit_url ?? `https://www.canva.com/design/${design.id}/edit`,
    viewUrl: design.urls?.view_url ?? `https://www.canva.com/design/${design.id}/view`,
  }
}

/**
 * Full "Edit in Canva" flow: upload image buffer → create design → return edit URL.
 */
export async function sendImageToCanva(params: {
  userId: string
  imageBuffer: Buffer
  title: string
}): Promise<CanvaDesign> {
  const asset = await uploadAssetToCanva({
    userId: params.userId,
    imageBuffer: params.imageBuffer,
    name: params.title,
  })
  return createCanvaDesignFromAsset({
    userId: params.userId,
    assetId: asset.assetId,
    title: params.title,
  })
}

export async function isCanvaConnected(userId: string): Promise<boolean> {
  const tokens = await getCanvaTokens(userId)
  return tokens !== null
}
