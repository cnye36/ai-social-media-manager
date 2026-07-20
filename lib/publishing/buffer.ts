import { createAdminClient } from '@/lib/supabase/admin'
import { isXThreadPost, buildXThreadBufferPayload, mediaToBufferAssets } from '@/lib/posts/x-format'
import { postBodyForPublish } from '@/lib/generate/image-prompt'
import type { Post, Channel, BufferProfile } from '@/types/database'
import type { PublishResult } from './types'

const BUFFER_MCP = 'https://mcp.buffer.com/mcp'
const MCP_VERSION = '2024-11-05'

const CHANNEL_LIST_TOOLS = [
  'list-channels', 'list_channels', 'get-channels', 'get_channels', 'channels',
  'list-profiles', 'list_profiles', 'get-profiles', 'get_profiles', 'profiles',
]
const CREATE_POST_TOOLS = ['create-post', 'create_post', 'createPost', 'add-post', 'add_post', 'create-update', 'create_update']
const ACCOUNT_TOOLS = ['get-account', 'get_account', 'account', 'get-user', 'get_user', 'me', 'whoami']

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

export interface BufferConnectResult {
  profiles: BufferProfile[]
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

function pickTool(tools: McpTool[], candidates: string[], pattern?: RegExp): McpTool | undefined {
  for (const name of candidates) {
    const found = tools.find(t => t.name === name)
    if (found) return found
  }
  if (pattern) return tools.find(t => pattern.test(t.name))
  return undefined
}

function serviceToChannel(raw: string): Channel | undefined {
  const s = raw.toLowerCase()
  if (SERVICE_TO_CHANNEL[s]) return SERVICE_TO_CHANNEL[s]
  if (s.includes('linkedin')) return 'linkedin'
  if (s.includes('twitter') || /\bx\b/.test(s)) return 'x'
  if (s.includes('facebook')) return 'facebook'
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
  const ids = new Set<string>()

  const accountTool = pickTool(tools, ACCOUNT_TOOLS, /get[-_]?account|^account$|whoami|\bme\b/i)
  if (accountTool) {
    try {
      const data = await callTool(token, accountTool.name, {}, sessionId)
      if (data && typeof data === 'object') {
        const orgs = (data as Record<string, unknown>).organizations
        if (Array.isArray(orgs)) {
          for (const org of orgs) {
            const id = firstString((org as Record<string, unknown>).id)
            if (id) ids.add(id)
          }
        }
      }
      extractOrganizationIds(data).forEach(id => ids.add(id))
    } catch {
      // Fall through to other discovery tools.
    }
  }

  const exactNames = [
    'list-organizations', 'list_organizations', 'get-organizations', 'get_organizations', 'organizations',
    'list-workspaces', 'list_workspaces', 'get-workspaces', 'get_workspaces', 'workspaces',
    'get-current-organization', 'get_current_organization', 'current-organization', 'current_organization',
    'get-user', 'get_user',
  ]
  const candidates = [
    ...exactNames
      .map(name => tools.find(tool => tool.name === name))
      .filter((tool): tool is McpTool => Boolean(tool)),
    ...tools.filter(tool =>
      /organi[sz]ation|workspace|whoami|\bme\b|user/i.test(tool.name) &&
      !exactNames.includes(tool.name) &&
      tool.name !== accountTool?.name
    ),
  ]

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

function orgIdRequired(schema: McpTool['inputSchema'] | undefined): boolean {
  return ['organizationId', 'organization_id', 'organization-id', 'orgId', 'org_id']
    .some(key => schemaRequires(schema, key))
}

function buildChannelArgs(schema: McpTool['inputSchema'] | undefined, organizationId?: string): Record<string, unknown> | null {
  const props = schema?.properties ?? {}
  const args: Record<string, unknown> = {}

  if (organizationId) {
    for (const key of ['organizationId', 'organization_id', 'organization-id', 'orgId', 'org_id']) {
      if (key in props) args[key] = organizationId
    }
    if (!Object.keys(args).length) args.organizationId = organizationId
  }

  if (!organizationId && orgIdRequired(schema)) {
    return null
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
    const channel = serviceToChannel(raw)
    if (!channel) continue
    const id = p.id ?? p.channel_id ?? p.channelId ?? ''
    if (!id) continue
    profiles.push({
      id,
      service: (SERVICE_TO_CHANNEL[raw] ? raw : channel) as BufferProfile['service'],
      service_username: p.service_username ?? p.username ?? p.handle ?? p.displayName ?? p.display_name ?? p.name ?? '',
      channel,
    })
  }

  return profiles
}

/** Map our post to Buffer MCP `create_post` args. */
function buildCreatePostArgs(
  post: Post,
  profile: { id: string },
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

  const image = post.media_items?.find(m => (m.type === 'image' || m.type === 'video') && m.url)
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
    // If schema inspection missed all time fields, force dueAt
    if (!args.dueAt && !args.due_at && !args.scheduledAt && !args.scheduled_at) {
      args.dueAt = scheduled
    }
  }

  // Fallback when schema is missing
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

async function fetchProfilesFromMcp(
  token: string,
  tools: McpTool[],
  sessionId?: string
): Promise<BufferProfile[]> {
  const channelTool = pickTool(tools, CHANNEL_LIST_TOOLS, /list[-_]?channels?|get[-_]?channels?|^channels$/i)
  if (!channelTool) return []

  const tryList = async (organizationId?: string): Promise<BufferProfile[]> => {
    const args = buildChannelArgs(channelTool.inputSchema, organizationId)
    if (args === null) return []
    const data = await callTool(token, channelTool.name, args, sessionId)
    return parseBufferProfiles(data)
  }

  const orgIds = await discoverOrganizationIds(token, tools, sessionId)

  for (const orgId of orgIds) {
    try {
      const profiles = await tryList(orgId)
      if (profiles.length) return profiles
    } catch {
      // Try the next discovered organization.
    }
  }

  try {
    const profiles = await tryList()
    if (profiles.length) return profiles
  } catch {
    // Channel listing may require org context.
  }

  return []
}

async function cacheBufferProfiles(companyId: string, profiles: BufferProfile[]): Promise<void> {
  if (!profiles.length) return
  const supabase = createAdminClient()
  await supabase
    .from('buffer_integrations')
    .update({ profiles })
    .eq('company_id', companyId)
}

async function resolveBufferProfile(
  integration: { access_token: string; profiles: BufferProfile[] },
  channel: Channel,
  sessionId: string | undefined,
  tools: McpTool[],
  companyId: string
): Promise<BufferProfile> {
  const stored = integration.profiles.find(p => p.channel === channel)
  if (stored?.id) return stored

  const profiles = await fetchProfilesFromMcp(integration.access_token, tools, sessionId)
  if (profiles.length) await cacheBufferProfiles(companyId, profiles)

  const profile = profiles.find(p => p.channel === channel)
  if (!profile) {
    const discovered = profiles.map(p => p.channel).join(', ') || 'none'
    throw new Error(
      `No Buffer channel found for "${channel}". MCP returned: ${discovered}. Connect that network in your Buffer workspace.`
    )
  }
  return profile
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Validate an MCP API key and optionally discover connected channels. */
export async function connectBufferMcp(accessToken: string): Promise<BufferConnectResult> {
  const sessionId = await initSession(accessToken)
  const tools = await listTools(accessToken, sessionId)

  const createTool = pickTool(tools, CREATE_POST_TOOLS, /create[-_]?post|add[-_]?post/i)
  if (!createTool) {
    throw new Error('Buffer MCP connected but create_post is unavailable. Check your API key.')
  }

  const profiles = await fetchProfilesFromMcp(accessToken, tools, sessionId)
  return { profiles }
}

export async function getBufferIntegration(companyId: string) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('buffer_integrations')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle()
  return data as { access_token: string; profiles: BufferProfile[] } | null
}

export async function publishViaBuffer(
  post: Post,
  options?: { requireCustomSchedule?: boolean },
): Promise<PublishResult> {
  const integration = await getBufferIntegration(post.company_id)
  if (!integration) throw new Error('No Buffer integration configured for this company')

  if (options?.requireCustomSchedule && !post.scheduled_for) {
    throw new Error('Set a publish date and time before sending to Buffer.')
  }

  const token = integration.access_token
  const sessionId = await initSession(token)
  const tools = await listTools(token, sessionId)
  const createTool = pickTool(tools, CREATE_POST_TOOLS, /create[-_]?post|add[-_]?post/i)
  if (!createTool) throw new Error('Buffer MCP does not expose a create_post tool')

  const profile = await resolveBufferProfile(integration, post.channel, sessionId, tools, post.company_id)
  const args = buildCreatePostArgs(post, profile, createTool.inputSchema)
  const data = await callTool(token, createTool.name, args, sessionId)
  const { postId, dueAt } = parseBufferPostMeta(data)

  return {
    success: true,
    platformPostId: postId,
    scheduledFor: dueAt ? new Date(dueAt).toISOString() : undefined,
  }
}
