import { createAdminClient } from '@/lib/supabase/admin'
import { isXThreadPost, buildXThreadBufferPayload, mediaToBufferAssets } from '@/lib/posts/x-format'
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

export interface BufferProfilesResult {
  profiles: BufferProfile[]
  organizationId?: string
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
  const r = result as { isError?: boolean; content?: Array<{ type: string; text?: string }> }
  const item = r?.content?.find(c => c.type === 'text')
  if (item?.text) {
    if (r.isError) throw new Error(`Buffer MCP tool error: ${item.text}`)
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

function schemaRequires(schema: McpTool['inputSchema'] | undefined, key: string): boolean {
  return schema?.required?.includes(key) ?? false
}

function firstString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function extractOrganizationId(data: unknown): string | undefined {
  const directKeys = ['organizationId', 'organization_id', 'orgId', 'org_id', 'workspaceId', 'workspace_id']

  function visit(obj: unknown): string | undefined {
    if (!obj || typeof obj !== 'object') return undefined
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const found = visit(item)
        if (found) return found
      }
      return undefined
    }

    const record = obj as Record<string, unknown>
    for (const key of directKeys) {
      const found = firstString(record[key])
      if (found) return found
    }

    for (const key of ['organization', 'org', 'workspace', 'account']) {
      const nested = record[key]
      if (nested && typeof nested === 'object') {
        const found = visit(nested)
        if (found) return found

        const nestedId = firstString((nested as Record<string, unknown>).id)
        if (nestedId) return nestedId
      }
    }

    const type = String(record.type ?? record.kind ?? '').toLowerCase()
    if (/organi[sz]ation|workspace|account/.test(type)) {
      const id = firstString(record.id)
      if (id) return id
    }

    for (const value of Object.values(record)) {
      const found = visit(value)
      if (found) return found
    }

    return undefined
  }

  const found = visit(data)
  if (found) return found

  if (Array.isArray(data) && data.length === 1) {
    return firstString((data[0] as Record<string, unknown> | undefined)?.id)
  }
  if (data && typeof data === 'object') {
    return firstString((data as Record<string, unknown>).id)
  }

  return undefined
}

async function discoverOrganizationId(
  token: string,
  tools: McpTool[],
  sessionId?: string
): Promise<string | undefined> {
  const exactNames = [
    'list_organizations', 'get_organizations', 'organizations',
    'list_workspaces', 'get_workspaces', 'workspaces',
    'get_current_organization', 'current_organization',
    'get_account', 'account', 'me', 'whoami', 'get_user',
  ]
  const candidates = [
    ...exactNames
      .map(name => tools.find(tool => tool.name === name))
      .filter((tool): tool is McpTool => Boolean(tool)),
    ...tools.filter(tool =>
      /organi[sz]ation|workspace|account|whoami|\bme\b|user/i.test(tool.name) &&
      !exactNames.includes(tool.name)
    ),
  ]

  for (const tool of candidates) {
    try {
      const data = await callTool(token, tool.name, {}, sessionId)
      const organizationId = extractOrganizationId(data)
      if (organizationId) return organizationId
    } catch {
      // Some discovery tools require arguments or scopes; try the next candidate.
    }
  }

  return undefined
}

function buildChannelArgs(schema: McpTool['inputSchema'] | undefined, organizationId?: string): Record<string, unknown> {
  const props = schema?.properties ?? {}
  const args: Record<string, unknown> = {}

  if (organizationId) {
    if ('organizationId' in props || !schema) args.organizationId = organizationId
    if ('organization_id' in props) args.organization_id = organizationId
  }
  if (organizationId && !Object.keys(args).length) args.organizationId = organizationId

  if (
    !organizationId &&
    (schemaRequires(schema, 'organizationId') || schemaRequires(schema, 'organization_id'))
  ) {
    throw new Error(
      'Buffer requires an organization ID for this API key, but none could be detected. Recreate the MCP key in Buffer and try again.'
    )
  }

  return args
}

/** Map our post to Buffer MCP `create_post` args (GraphQL CreatePostInput). */
function buildCreatePostArgs(
  post: Post,
  profile: { id: string },
  organizationId: string | null | undefined,
  schema?: McpTool['inputSchema']
): Record<string, unknown> {
  const props = schema?.properties ?? {}
  const has = (key: string) => key in props

  const scheduled = post.scheduled_for ? new Date(post.scheduled_for).toISOString() : undefined
  const mode = scheduled ? 'customScheduled' : 'addToQueue'
  const schedulingType = 'automatic'

  const xThread = post.channel === 'x' && isXThreadPost(post)
    ? buildXThreadBufferPayload(post)
    : null

  const image = post.media_items?.find(m => m.type === 'image' && m.url)
  const assets = xThread
    ? xThread.assets
    : image?.url
      ? mediaToBufferAssets(image)
      : []
  const text = xThread ? xThread.text : post.content
  const threadMetadata = xThread?.metadata

  const args: Record<string, unknown> = {}

  if (has('channelId')) args.channelId = profile.id
  if (has('channel_id')) args.channel_id = profile.id
  if (has('text')) args.text = text
  if (has('content') && !has('text')) args.content = text
  if (has('schedulingType')) args.schedulingType = schedulingType
  if (has('scheduling_type')) args.scheduling_type = schedulingType
  if (has('mode')) args.mode = mode
  if (has('assets')) args.assets = assets
  if (organizationId && has('organizationId')) args.organizationId = organizationId

  if (threadMetadata) {
    // Always include thread metadata — required for multi-tweet X posts
    args.metadata = threadMetadata
  }

  if (scheduled) {
    if (has('dueAt')) args.dueAt = scheduled
    if (has('due_at')) args.due_at = scheduled
    if (has('scheduledAt')) args.scheduledAt = scheduled
    if (has('scheduled_at')) args.scheduled_at = scheduled
  }

  // Fallback when schema is missing — use Buffer GraphQL field names
  if (!Object.keys(args).length) {
    return {
      channelId: profile.id,
      text,
      schedulingType,
      mode,
      assets,
      ...(organizationId ? { organizationId } : {}),
      ...(threadMetadata ? { metadata: threadMetadata } : {}),
      ...(scheduled ? { dueAt: scheduled } : {}),
    }
  }

  return args
}

/** Extract Buffer post id and queue slot from create_post / get_post payloads. */
function parseBufferPostMeta(data: unknown): { postId?: string; dueAt?: string } {
  const dueKeys = ['dueAt', 'due_at', 'scheduledAt', 'scheduled_at'] as const
  const idKeys = ['id', 'postId', 'post_id', 'update_id', 'updateId'] as const

  function fromObject(o: Record<string, unknown>): { postId?: string; dueAt?: string } {
    const dueAt = dueKeys.map(k => o[k]).find(v => typeof v === 'string' && v) as string | undefined
    const postId = idKeys.map(k => o[k]).find(v => typeof v === 'string' && v) as string | undefined
    return { postId, dueAt }
  }

  function visit(obj: unknown): { postId?: string; dueAt?: string } {
    if (!obj || typeof obj !== 'object') return {}
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const found = visit(item)
        if (found.dueAt) return found
      }
      return {}
    }
    const o = obj as Record<string, unknown>
    const direct = fromObject(o)
    if (o.post && typeof o.post === 'object') {
      const nested = visit(o.post)
      return {
        postId: nested.postId ?? direct.postId,
        dueAt: nested.dueAt ?? direct.dueAt,
      }
    }
    if (direct.dueAt) return direct
    for (const val of Object.values(o)) {
      if (val && typeof val === 'object') {
        const nested = visit(val)
        if (nested.dueAt) {
          return { postId: nested.postId ?? direct.postId, dueAt: nested.dueAt }
        }
      }
    }
    return direct
  }

  return visit(data)
}

async function fetchBufferPostDueAt(
  token: string,
  bufferPostId: string,
  tools: McpTool[],
  sessionId?: string
): Promise<string | undefined> {
  const getTool = pickTool(tools, ['get_post', 'getPost', 'post', 'fetch_post', 'get_update'])
  if (!getTool) return undefined

  const props = getTool.inputSchema?.properties ?? {}
  const args: Record<string, unknown> = {}
  if ('postId' in props) args.postId = bufferPostId
  if ('post_id' in props) args.post_id = bufferPostId
  if ('id' in props) args.id = bufferPostId
  if (!Object.keys(args).length) args.id = bufferPostId

  const data = await callTool(token, getTool.name, args, sessionId)
  return parseBufferPostMeta(data).dueAt
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function fetchBufferProfiles(
  accessToken: string,
  organizationId?: string
): Promise<BufferProfile[]> {
  return (await fetchBufferProfilesWithOrganization(accessToken, organizationId)).profiles
}

export async function fetchBufferProfilesWithOrganization(
  accessToken: string,
  organizationId?: string
): Promise<BufferProfilesResult> {
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

  const resolvedOrganizationId = organizationId ?? await discoverOrganizationId(accessToken, tools, sessionId)
  const channelArgs = buildChannelArgs(channelTool.inputSchema, resolvedOrganizationId)
  const data = await callTool(accessToken, channelTool.name, channelArgs, sessionId)

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
  return { profiles, organizationId: resolvedOrganizationId }
}

export async function getBufferIntegration(companyId: string) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('buffer_integrations')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle()
  return data as { access_token: string; organization_id: string | null; profiles: BufferProfile[] } | null
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

  const organizationId = integration.organization_id ?? await discoverOrganizationId(
    integration.access_token, tools, sessionId
  )

  const args = buildCreatePostArgs(
    post,
    profile,
    organizationId,
    createTool.inputSchema
  )

  const result = await callTool(integration.access_token, createTool.name, args, sessionId)

  // Surface any error string the MCP returned instead of silently succeeding
  if (typeof result === 'string' && result.length > 0) {
    const lower = result.toLowerCase()
    if (lower.includes('error') || lower.includes('failed') || lower.includes('invalid')) {
      throw new Error(`Buffer rejected the post: ${result}`)
    }
  }

  let { postId: platformPostId, dueAt } = parseBufferPostMeta(result)

  if (!dueAt && platformPostId) {
    dueAt = await fetchBufferPostDueAt(
      integration.access_token, platformPostId, tools, sessionId
    )
  }

  return {
    success: true,
    platformPostId,
    scheduledFor: dueAt ? new Date(dueAt).toISOString() : undefined,
  }
}
