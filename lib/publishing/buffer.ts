import { createAdminClient } from '@/lib/supabase/admin'
import type { Post, Channel, BufferProfile } from '@/types/database'
import type { PublishResult } from './types'

const BUFFER_MCP = 'https://mcp.buffer.com/mcp'
const MCP_VERSION = '2024-11-05'

export const SERVICE_TO_CHANNEL: Record<string, Channel> = {
  twitter:           'x',
  twitter_v2:        'x',
  x:                 'x',
  linkedin:          'linkedin',
  linkedin_company:  'linkedin',
  linkedin_personal: 'linkedin',
  facebook:          'facebook',
  facebook_page:     'facebook',
  facebook_group:    'facebook',
}

// ─── MCP helpers ─────────────────────────────────────────────────────────────

interface McpTool {
  name: string
  description?: string
  inputSchema?: { properties?: Record<string, unknown>; required?: string[] }
}

interface McpEnvelope<T = unknown> {
  result?: T
  error?: { code: number; message: string }
}

async function mcpFetch<T>(
  token: string,
  body: object,
  sessionId?: string
): Promise<{ result: T; sessionId?: string }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  }
  if (sessionId) headers['Mcp-Session-Id'] = sessionId

  const res = await fetch(BUFFER_MCP, { method: 'POST', headers, body: JSON.stringify(body) })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Buffer MCP (${res.status}): ${text}`)
  }

  const newSession = res.headers.get('Mcp-Session-Id') ?? sessionId
  const contentType = res.headers.get('content-type') ?? ''
  let envelope: McpEnvelope<T>

  if (contentType.includes('text/event-stream')) {
    const text = await res.text()
    const lines = text.split('\n').filter(l => l.startsWith('data: '))
    const last = lines[lines.length - 1]
    if (!last) throw new Error('Empty SSE response from Buffer MCP')
    envelope = JSON.parse(last.slice(6)) as McpEnvelope<T>
  } else {
    envelope = await res.json() as McpEnvelope<T>
  }

  if (envelope.error) throw new Error(`Buffer MCP: ${envelope.error.message}`)
  if (envelope.result === undefined) throw new Error('Buffer MCP returned no result')

  return { result: envelope.result, sessionId: newSession ?? undefined }
}

async function initSession(token: string): Promise<string | undefined> {
  const { sessionId } = await mcpFetch(token, {
    jsonrpc: '2.0', method: 'initialize',
    params: { protocolVersion: MCP_VERSION, capabilities: {}, clientInfo: { name: 'social-media-manager', version: '1.0.0' } },
    id: 1,
  })
  if (sessionId) {
    fetch(BUFFER_MCP, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Mcp-Session-Id': sessionId },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    }).catch(() => {})
  }
  return sessionId
}

async function listTools(token: string, sessionId?: string): Promise<McpTool[]> {
  const { result } = await mcpFetch<{ tools?: McpTool[] }>(
    token, { jsonrpc: '2.0', method: 'tools/list', id: 2 }, sessionId
  )
  return result.tools ?? []
}

function pickTool(tools: McpTool[], candidates: string[]): McpTool | undefined {
  for (const name of candidates) {
    const found = tools.find(t => t.name === name)
    if (found) return found
  }
  return undefined
}

function extractContent(result: unknown): unknown {
  const r = result as { content?: Array<{ type: string; text?: string }> }
  const item = r?.content?.find(c => c.type === 'text')
  if (item?.text) {
    try { return JSON.parse(item.text) } catch { return item.text }
  }
  return result
}

async function callTool(
  token: string, name: string, args: Record<string, unknown>, sessionId?: string
): Promise<unknown> {
  const { result } = await mcpFetch<unknown>(
    token,
    { jsonrpc: '2.0', method: 'tools/call', params: { name, arguments: args }, id: Date.now() },
    sessionId
  )
  return extractContent(result)
}

// ─── Public API ──────────────────────────────────────────────────────────────

// organizationId is provided by the user from their Buffer settings — no programmatic lookup needed
export async function fetchBufferProfiles(
  accessToken: string,
  organizationId: string
): Promise<BufferProfile[]> {
  const sessionId = await initSession(accessToken)
  const tools = await listTools(accessToken, sessionId)

  if (!tools.length) {
    throw new Error('Buffer MCP returned no tools. Check that your token has the right scopes.')
  }

  const channelTool = pickTool(tools, [
    'list_channels', 'get_channels', 'channels',
    'list_profiles', 'get_profiles', 'profiles',
  ])

  if (!channelTool) {
    throw new Error(`No channel-listing tool found. Available: ${tools.map(t => t.name).join(', ')}`)
  }

  const data = await callTool(accessToken, channelTool.name, { organizationId }, sessionId)

  const items: unknown[] = Array.isArray(data)
    ? data
    : (data as Record<string, unknown[]>).channels
      ?? (data as Record<string, unknown[]>).profiles
      ?? []

  const profiles: BufferProfile[] = []
  for (const p of items as Array<Record<string, string>>) {
    const raw = (
      p.service ?? p.service_type ?? p.platform ?? p.type ??
      p.network ?? p.channel_type ?? p.provider ?? ''
    ).toLowerCase()
    const channel = SERVICE_TO_CHANNEL[raw]
    if (!channel) continue
    profiles.push({
      id: p.id ?? p.channel_id ?? '',
      service: raw as BufferProfile['service'],
      service_username: p.service_username ?? p.username ?? p.handle ?? p.display_name ?? p.name ?? '',
      channel,
    })
  }

  if (!profiles.length) {
    throw new Error(
      `No supported profiles found. Raw list_channels response: ${JSON.stringify(data).slice(0, 600)}`
    )
  }
  return profiles
}

export async function getBufferIntegration(companyId: string) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('buffer_integrations')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle()
  return data as { access_token: string; organization_id: string; profiles: BufferProfile[] } | null
}

export async function publishViaBuffer(post: Post): Promise<PublishResult> {
  const integration = await getBufferIntegration(post.company_id)
  if (!integration) throw new Error('No Buffer integration configured for this company')

  const profile = integration.profiles.find(p => p.channel === post.channel)
  if (!profile) {
    throw new Error(
      `No Buffer profile for channel "${post.channel}". Connect a ${post.channel} account in Settings > Connections.`
    )
  }

  const sessionId = await initSession(integration.access_token)
  const tools = await listTools(integration.access_token, sessionId)

  const createTool = pickTool(tools, [
    'create_post', 'create_update', 'schedule_post',
    'publish_post', 'create_draft', 'add_to_queue', 'queue_post',
  ])

  if (!createTool) {
    throw new Error(`No post-creation tool found. Available: ${tools.map(t => t.name).join(', ')}`)
  }

  const schema = createTool.inputSchema
  const knownKeys = schema?.properties ? new Set(Object.keys(schema.properties)) : null

  const scheduled = post.scheduled_for ? new Date(post.scheduled_for).toISOString() : undefined
  const image = post.media_items?.find(m => m.type === 'image' && m.url)

  const allArgs: Record<string, unknown> = {
    channel_id: profile.id,
    channelId: profile.id,
    profile_id: profile.id,
    organizationId: integration.organization_id,
    text: post.content,
    content: post.content,
    ...(scheduled ? { scheduled_at: scheduled, scheduledAt: scheduled, due_at: scheduled } : {}),
    ...(image?.url ? { media_urls: [image.url], mediaUrls: [image.url], image_url: image.url } : {}),
  }

  const args = knownKeys
    ? Object.fromEntries(Object.entries(allArgs).filter(([k]) => knownKeys.has(k)))
    : allArgs

  const result = await callTool(integration.access_token, createTool.name, args, sessionId)
  const r = result as Record<string, string> | null
  const postId = r?.id ?? r?.post_id ?? r?.update_id

  return { success: true, platformPostId: postId }
}
