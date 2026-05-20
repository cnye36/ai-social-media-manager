import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { writePlanSlots } from '@/lib/content-planning/write-batch'

export const maxDuration = 300

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, context: RouteContext) {
  const { id: planId } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { companyId, slotIds, additionalContext } = body as {
    companyId: string
    slotIds?: string[]
    additionalContext?: string
  }

  if (!companyId) {
    return NextResponse.json({ error: 'companyId required' }, { status: 400 })
  }

  const { data: plan } = await supabase
    .from('content_plans')
    .select('id, company_id, additional_context')
    .eq('id', planId)
    .eq('company_id', companyId)
    .single()

  if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })

  try {
    const result = await writePlanSlots(
      supabase,
      planId,
      companyId,
      slotIds,
      additionalContext ?? plan.additional_context ?? undefined,
    )
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Batch write failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
