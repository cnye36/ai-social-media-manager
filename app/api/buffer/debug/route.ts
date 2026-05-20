import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const BUFFER_MCP = 'https://mcp.buffer.com/mcp'
const MCP_VERSION = '2024-11-05'

async function mcpPost(token: string, body: object, sessionId?: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  }
  if (sessionId) headers['Mcp-Session-Id'] = sessionId

  const res = await fetch(BUFFER_MCP, { method: 'POST', headers, body: JSON.stringify(body) })
  const newSession = res.headers.get('Mcp-Session-Id')
  const contentType = res.headers.get('content-type') ?? ''

  let rawBody: unknown
  if (contentType.includes('text/event-stream')) {
    const text = await res.text()
    // Return every SSE data line parsed
    rawBody = text.split('\n')
      .filter(l => l.startsWith('data: '))
      .map(l => { try { return JSON.parse(l.slice(6)) } catch { return l } })
  } else {
    rawBody = await res.json().catch(async () => res.text())
  }

  return { status: res.status, sessionId: newSession ?? sessionId, rawBody }
}

// GET /api/buffer/debug?companyId=xxx
// Full diagnostic: init → tools/list → org ID → list_channels (raw, unfiltered)
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = req.nextUrl.searchParams.get('companyId')
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

  const { data: integration } = await supabase
    .from('buffer_integrations')
    .select('access_token')
    .eq('company_id', companyId)
    .maybeSingle()

  if (!integration) return NextResponse.json({ error: 'No integration found' }, { status: 404 })
  const token = integration.access_token

  // 1. Initialize
  const initRes = await mcpPost(token, {
    jsonrpc: '2.0', method: 'initialize',
    params: { protocolVersion: MCP_VERSION, capabilities: {}, clientInfo: { name: 'debug', version: '1.0.0' } },
    id: 1,
  })
  const sessionId = initRes.sessionId ?? undefined

  // 2. tools/list — raw, all tools with their full schemas
  const toolsRes = await mcpPost(token, { jsonrpc: '2.0', method: 'tools/list', id: 2 }, sessionId)

  const toolsBody = toolsRes.rawBody as { result?: { tools?: Array<{ name: string; inputSchema?: unknown }> } }
  const tools = (Array.isArray(toolsBody) ? toolsBody[0] : toolsBody)?.result?.tools ?? []
  const toolNames = tools.map((t: { name: string }) => t.name)

  // 3. Call every org/user/account tool with no args — raw response
  const orgCandidates = tools.filter((t: { name: string }) =>
    /org|user|account|me|who/i.test(t.name)
  )
  const orgResults: Record<string, unknown> = {}
  for (const t of orgCandidates as Array<{ name: string }>) {
    const r = await mcpPost(token, {
      jsonrpc: '2.0', method: 'tools/call',
      params: { name: t.name, arguments: {} }, id: Date.now(),
    }, sessionId)
    orgResults[t.name] = r.rawBody
  }

  // 4. Try list_channels with every possible org ID we can extract from org results
  const channelResults: Record<string, unknown> = {}
  const orgIds = new Set<string>()

  for (const raw of Object.values(orgResults)) {
    // Dig through SSE array or direct response to find IDs
    const payloads = Array.isArray(raw) ? raw : [raw]
    for (const payload of payloads) {
      const result = (payload as { result?: unknown })?.result
      const extract = (obj: unknown): void => {
        if (!obj || typeof obj !== 'object') return
        if (Array.isArray(obj)) { obj.forEach(extract); return }
        const o = obj as Record<string, unknown>
        if (typeof o.id === 'string') orgIds.add(o.id)
        if (typeof o.organizationId === 'string') orgIds.add(o.organizationId)
        Object.values(o).forEach(extract)
      }
      // content[].text is often a JSON string
      const contentItems = (result as { content?: Array<{ text?: string }> })?.content ?? []
      for (const c of contentItems) {
        if (c.text) {
          try { extract(JSON.parse(c.text)) } catch { /* ignore */ }
        }
      }
      extract(result)
    }
  }

  for (const orgId of orgIds) {
    const r = await mcpPost(token, {
      jsonrpc: '2.0', method: 'tools/call',
      params: { name: 'list_channels', arguments: { organizationId: orgId } },
      id: Date.now(),
    }, sessionId)
    channelResults[`list_channels(orgId=${orgId})`] = r.rawBody
  }

  // Also try list_channels with no args and with a wildcard
  const r0 = await mcpPost(token, {
    jsonrpc: '2.0', method: 'tools/call',
    params: { name: 'list_channels', arguments: {} }, id: Date.now(),
  }, sessionId)
  channelResults['list_channels(no args)'] = r0.rawBody

  return NextResponse.json({
    step1_initStatus: initRes.status,
    step2_toolNames: toolNames,
    step2_toolSchemas: tools,
    step3_orgCandidates: orgCandidates.map((t: { name: string }) => t.name),
    step3_orgResults: orgResults,
    step4_orgIdsFound: [...orgIds],
    step4_channelResults: channelResults,
  }, { status: 200 })
}
