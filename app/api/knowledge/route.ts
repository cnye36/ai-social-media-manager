import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { deleteChunk } from '@/lib/rag/ingest'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const companyId = searchParams.get('companyId')
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error, count } = await supabase
    .from('knowledge_chunks')
    .select('id, title, source_url, source_type, content, created_at', { count: 'exact' })
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ chunks: data, total: count })
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const chunkId = searchParams.get('id')
  if (!chunkId) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await deleteChunk(chunkId)
  return NextResponse.json({ success: true })
}
