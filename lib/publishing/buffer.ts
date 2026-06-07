import { createAdminClient } from '@/lib/supabase/admin'
import { isXThreadPost, buildXThreadBufferPayload, mediaToBufferAssets } from '@/lib/posts/x-format'
import { postBodyForPublish } from '@/lib/generate/image-prompt'
import type { Post, Channel, BufferProfile } from '@/types/database'
import type { PublishResult } from './types'

const BUFFER_MCP = 'https://mcp.buffer.com/mcp'
const BUFFER_GRAPHQL = 'https://api.buffer.com'
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

interface GraphqlEnvelope<T = unknown> {
  data?: T
  errors?: Array<{ message?: string; extensions?: { retryAfter?: number; code?: string } }>
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

async function bufferGraphql<T>(
  token: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(BUFFER_GRAPHQL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })

  const envelope = await res.json().catch(async () => ({
    errors: [{ message: await res.text() }],
  })) as GraphqlEnvelope<T>

  if (!res.ok || envelope.errors?.length) {
    const first = envelope.errors?.[0]
    const retryAfter = first?.extensions?.retryAfter
    const wait = retryAfter ? ` Try again in ${Math.ceil(retryAfter / 60)} minutes.` : ''
    throw new Error(`Buffer API${res.ok ? '' : ` (${res.status})`}: ${first?.message ?? res.statusText}${wait}`)
  }

  if (!envelope.data) throw new Error('Buffer API returned no data')
  return envelope.data
}

function schemaRequires(schema: McpTool['inputSchema'] | undefined, key: string): boolean {
  return schema?.required?.includes(key) ?? false
}

function firstString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function extractOrganizationIds(data: unknown): string[] {
  const directKeys = ['organizationId', 'organization_id', 'orgId', 'org_id', 'workspaceId', 'workspace_id']
  const ids = new Set<string>()

  const add = (value: unknown) => {
    const id = firstString(value)
    if (id) ids.add(id)
  }

  function visit(obj: unknown): void {
    if (!obj || typeof obj !== 'object') return
    if (Array.isArray(obj)) {
      obj.forEach(visit)
      return
    }

    const record = obj as Record<string, unknown>
    for (const key of directKeys) {
      add(record[key])
    }

    for (const key of ['organization', 'org', 'workspace', 'account']) {
      const nested = record[key]
      if (nested && typeof nested === 'object') {
        visit(nested)
        add((nested as Record<string, unknown>).id)
      }
    }

    const type = String(record.type ?? record.kind ?? '').toLowerCase()
    if (/organi[sz]ation|workspace|account/.test(type)) {
      add(record.id)
    }

    Object.values(record).forEach(visit)
  }

  visit(data)

  if (Array.isArray(data) && data.length === 1) {
    add((data[0] as Record<string, unknown> | undefined)?.id)
  }
  if (data && typeof data === 'object') {
    add((data as Record<string, unknown>).id)
  }

  return [...ids]
}

async function discoverOrganizationIds(
  token: string,
  tools: McpTool[],
  sessionId?: string
): Promise<string[]> {
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
  const ids = new Set<string>()

  for (const tool of candidates) {
    try {
      const data = await callTool(token, tool.name, {}, sessionId)
      extractOrganizationIds(data).forEach(id => ids.add(id))
    } catch {
      // Some discovery tools require arguments or scopes; try the next candidate.
    }
  }

  return [...ids]
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

function extractProfileItems(data: unknown): unknown[] {
  if (Array.isArray(data)) return data
  if (!data || typeof data !== 'object') return []

  const record = data as Record<string, unknown>
  for (const key of ['channels', 'profiles', 'items', 'data', 'nodes']) {
    if (Array.isArray(record[key])) return record[key] as unknown[]
  }

  return []
}

function parseBufferProfiles(data: unknown): BufferProfile[] {
  const profiles: BufferProfile[] = []

  for (const p of extractProfileItems(data) as Array<Record<string, string>>) {
    const raw = (
      p.service ?? p.service_type ?? p.platform ?? p.type ??
      p.network ?? p.channel_type ?? p.provider ?? ''
    ).toLowerCase()
    const channel = SERVICE_TO_CHANNEL[raw]
    if (!channel) continue
    profiles.push({
      id: p.id ?? p.channel_id ?? '',
      service: raw as BufferProfile['service'],
      service_username: p.service_username ?? p.username ?? p.handle ?? p.displayName ?? p.display_name ?? p.name ?? '',
      channel,
    })
  }

  return profiles
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
  const text = xThread ? xThread.text : postBodyForPublish(post.content)
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

  // Facebook requires type inside metadata.facebook.type (PostInputMetaData → FacebookPostMetadataInput)
  if (post.channel === 'facebook') {
    args.metadata = { facebook: { type: 'post' } }
  } else if (threadMetadata) {
    // X thread metadata — required for multi-tweet posts
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
      ...(post.channel === 'facebook'
        ? { metadata: { facebook: { type: 'post' } } }
        : threadMetadata ? { metadata: threadMetadata } : {}),
      ...(organizationId ? { organizationId } : {}),
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
  if (!organizationId) {
    throw new Error(
      'Buffer organization ID is required. Copy it from Buffer Settings > API and paste it with the API key.'
    )
  }

  const data = await bufferGraphql<{ channels: Array<Record<string, string>> }>(
    accessToken,
    `
      query GetChannels($orgId: String!) {
        channels(input: { organizationId: $orgId }) {
          id
          name
          displayName
          service
          avatar
          isQueuePaused
        }
      }
    `,
    { orgId: organizationId }
  )

  const profiles = parseBufferProfiles(data)
  if (profiles.length) return { profiles, organizationId }

  throw new Error(
    `No supported profiles found. Raw channels response: ${JSON.stringify(data.channels ?? []).slice(0, 600)}`
  )
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

export async function publishViaBuffer(
  post: Post,
  options?: { requireCustomSchedule?: boolean },
): Promise<PublishResult> {
  const integration = await getBufferIntegration(post.company_id)
  if (!integration) throw new Error('No Buffer integration configured for this company')

  const profile = integration.profiles.find(p => p.channel === post.channel)
  if (!profile) {
    throw new Error(
      `No Buffer profile for channel "${post.channel}". Connect a ${post.channel} account in Settings > Connections.`
    )
  }

  if (options?.requireCustomSchedule && !post.scheduled_for) {
    throw new Error('Set a publish date and time before sending to Buffer.')
  }

  const token = integration.access_token
  const sessionId = await initSession(token)
  const tools = await listTools(token, sessionId)
  const createTool = pickTool(tools, ['create_post', 'createPost', 'add_post', 'create_update'])
  if (!createTool) throw new Error('Buffer MCP does not expose a create_post tool')

  const args = buildCreatePostArgs(post, profile, integration.organization_id, createTool.inputSchema)
  const data = await callTool(token, createTool.name, args, sessionId)
  const { postId, dueAt } = parseBufferPostMeta(data)

  return {
    success: true,
    platformPostId: postId,
    scheduledFor: dueAt ? new Date(dueAt).toISOString() : undefined,
  }
}
