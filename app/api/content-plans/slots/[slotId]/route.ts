import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RouteContext {
  params: Promise<{ slotId: string }>
}

export async function PATCH(request: Request, context: RouteContext) {
  const { slotId } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Resolve owning company and verify the user owns it
  const { data: slot } = await supabase
    .from('content_plan_slots')
    .select('id, company_id, plan:content_plans!inner(owner_id)')
    .eq('id', slotId)
    .single()

  if (!slot) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const ownerOf = (slot.plan as unknown as { owner_id: string } | null)?.owner_id
  if (ownerOf !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json() as Record<string, unknown>

  const allowed = ['status', 'topic', 'notes', 'scheduled_for', 'post_id']
  const patch: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) patch[key] = body[key]
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  // Chain company_id into the update so a race condition can't affect another tenant's rows
  const { data, error } = await supabase
    .from('content_plan_slots')
    .update(patch)
    .eq('id', slotId)
    .eq('company_id', slot.company_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
