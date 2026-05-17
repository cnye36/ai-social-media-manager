import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ingestManual } from '@/lib/rag/ingest'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { companyId, title, content } = body

  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
  if (!content?.trim()) return NextResponse.json({ error: 'content required' }, { status: 400 })

  // Verify ownership
  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .single()

  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  try {
    const chunks = await ingestManual(companyId, title?.trim() || 'Manual entry', content.trim())
    return NextResponse.json({ chunks_created: chunks }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ingest failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
