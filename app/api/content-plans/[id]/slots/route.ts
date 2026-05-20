import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Channel } from '@/types/database'
import type { ContentGoal, PostLength } from '@/types/agents'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, context: RouteContext) {
  const { id: planId } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const {
    company_id,
    scheduled_for,
    channel,
    topic,
    post_type,
    pillar,
    content_goal,
    post_length,
    notes,
  } = body as {
    company_id: string
    scheduled_for: string
    channel: Channel
    topic: string
    post_type?: string
    pillar?: string
    content_goal?: ContentGoal
    post_length?: PostLength
    notes?: string
  }

  if (!company_id || !scheduled_for || !channel || !topic?.trim()) {
    return NextResponse.json(
      { error: 'company_id, scheduled_for, channel, and topic are required' },
      { status: 400 },
    )
  }

  const { data: plan } = await supabase
    .from('content_plans')
    .select('id')
    .eq('id', planId)
    .eq('company_id', company_id)
    .single()

  if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('content_plan_slots')
    .insert({
      plan_id: planId,
      company_id,
      scheduled_for,
      channel,
      topic: topic.trim(),
      post_type: post_type ?? 'custom',
      pillar: pillar ?? null,
      content_goal: content_goal ?? 'awareness',
      post_length: post_length ?? 'medium',
      notes: notes ?? null,
      status: 'planned',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
