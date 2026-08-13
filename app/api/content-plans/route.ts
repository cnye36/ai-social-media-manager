import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateContentPlan, clampPlanDates } from '@/lib/content-planning/generate-plan'
import type { Channel } from '@/types/database'

export const maxDuration = 120

const VALID_CHANNELS: Channel[] = ['linkedin', 'x', 'reddit', 'facebook']

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const companyId = searchParams.get('companyId')
  if (!companyId) {
    return NextResponse.json({ error: 'companyId required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('content_plans')
    .select('*')
    .eq('company_id', companyId)
    .order('start_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const {
    companyId,
    name,
    startDate,
    endDate,
    channels,
    additionalContext,
  } = body as {
    companyId: string
    name: string
    startDate: string
    endDate: string
    channels: Channel[]
    additionalContext?: string
  }

  if (!companyId || !name?.trim() || !startDate || !endDate) {
    return NextResponse.json(
      { error: 'companyId, name, startDate, and endDate are required' },
      { status: 400 },
    )
  }

  if (endDate < startDate) {
    return NextResponse.json(
      { error: 'End date must be on or after the start date' },
      { status: 400 },
    )
  }

  const validChannels = (channels ?? []).filter(c => VALID_CHANNELS.includes(c))
  if (validChannels.length === 0) {
    return NextResponse.json({ error: 'At least one channel is required' }, { status: 400 })
  }

  const { data: company } = await supabase.from('companies').select('id').eq('id', companyId).single()
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  const dates = clampPlanDates(startDate, endDate)

  try {
    const { planId } = await generateContentPlan(supabase, {
      companyId,
      name: name.trim(),
      startDate: dates.start,
      endDate: dates.end,
      channels: validChannels,
      additionalContext: additionalContext?.trim(),
    })

    const { data: plan } = await supabase
      .from('content_plans')
      .select('*, content_plan_slots(*)')
      .eq('id', planId)
      .single()

    return NextResponse.json(plan, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate plan'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
