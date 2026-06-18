import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { connectBufferMcp } from '@/lib/publishing/buffer'

// GET  /api/buffer?companyId=xxx  — fetch current integration (token redacted)
// POST /api/buffer                — connect with a pasted MCP API key
// DELETE /api/buffer?companyId=xxx — disconnect

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = req.nextUrl.searchParams.get('companyId')
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

  const { data } = await supabase
    .from('buffer_integrations')
    .select('id, connected_at')
    .eq('company_id', companyId)
    .maybeSingle()

  return NextResponse.json(data ?? null)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, accessToken } = await req.json() as {
    companyId?: string
    accessToken?: string
  }
  if (!companyId || !accessToken) {
    return NextResponse.json({ error: 'companyId and accessToken are required' }, { status: 400 })
  }

  const { data: company } = await supabase.from('companies').select('id').eq('id', companyId).maybeSingle()
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  let bufferResult
  try {
    bufferResult = await connectBufferMcp(accessToken)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }

  const { error } = await supabase
    .from('buffer_integrations')
    .upsert({
      company_id: companyId,
      access_token: accessToken,
      profiles: bufferResult.profiles,
      connected_at: new Date().toISOString(),
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ connected: true })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = req.nextUrl.searchParams.get('companyId')
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

  const { error } = await supabase
    .from('buffer_integrations')
    .delete()
    .eq('company_id', companyId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
