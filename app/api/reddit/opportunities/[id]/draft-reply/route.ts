import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { draftReplyPair } from '@/lib/reddit/monitor'

interface Params { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const { companyId, additionalContext } = await req.json() as {
    companyId: string
    additionalContext?: string
  }

  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

  // Verify ownership via RLS
  const supabase = await createClient()
  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .single()

  if (!company) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const pair = await draftReplyPair(id, companyId, additionalContext)
    return NextResponse.json(pair)
  } catch (err) {
    console.error('Draft reply error:', err)
    return NextResponse.json({ error: 'Failed to draft reply' }, { status: 500 })
  }
}
