import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: plan, error } = await supabase
    .from('content_plans')
    .select('*, content_plan_slots(*)')
    .eq('id', id)
    .single()

  if (error || !plan) {
    return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
  }

  const slots = (plan.content_plan_slots ?? []).sort(
    (a: { scheduled_for: string }, b: { scheduled_for: string }) =>
      new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime(),
  )

  return NextResponse.json({ ...plan, slots, content_plan_slots: undefined })
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { name, status, additional_context } = body

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name
  if (status !== undefined) updates.status = status
  if (additional_context !== undefined) updates.additional_context = additional_context

  const { data, error } = await supabase
    .from('content_plans')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase.from('content_plans').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
