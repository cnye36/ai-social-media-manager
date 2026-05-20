import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface Params { params: Promise<{ id: string }> }

// PATCH — update status (dismissed, manual_review, replied, etc.)
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const body = await req.json() as { status?: string; draft_reply?: string }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('reddit_opportunities')
    .update(body)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
