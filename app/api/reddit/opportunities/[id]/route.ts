import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface Params { params: Promise<{ id: string }> }

const VALID_STATUSES = new Set(['new', 'drafted', 'replied', 'dismissed', 'manual_review'])

// PATCH — update status (dismissed, manual_review, replied, etc.)
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const body = await req.json() as { status?: string; draft_reply?: string }

  if (body.status !== undefined && !VALID_STATUSES.has(body.status)) {
    return NextResponse.json({ error: `Invalid status: ${body.status}` }, { status: 400 })
  }

  const updates: { status?: string; draft_reply?: string } = {}
  if (body.status !== undefined) updates.status = body.status
  if (body.draft_reply !== undefined) updates.draft_reply = body.draft_reply

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('reddit_opportunities')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 })
  return NextResponse.json(data)
}
