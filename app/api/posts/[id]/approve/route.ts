import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getNextAvailableSlot } from '@/lib/scheduling/next-slot'
import type { Channel } from '@/types/database'

const SOCIAL_CHANNELS: Channel[] = ['linkedin', 'x', 'facebook']

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { after } = await request.json().catch(() => ({})) as { after?: string }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: post } = await supabase
    .from('posts')
    .select('*')
    .eq('id', id)
    .single()

  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('id', post.company_id)
    .eq('owner_id', user.id)
    .single()

  if (!company) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (post.status !== 'draft') {
    return NextResponse.json({ error: 'Only draft posts can be approved' }, { status: 400 })
  }

  if (!SOCIAL_CHANNELS.includes(post.channel as Channel)) {
    return NextResponse.json({ error: 'Auto-scheduling only applies to social channels' }, { status: 400 })
  }

  // Posts created from a content plan already have a jittered scheduled time — use it directly
  const generationParams = post.generation_params as Record<string, unknown> | null
  const plannedFor = generationParams?.planned_for
  let scheduledFor: string

  if (typeof plannedFor === 'string') {
    scheduledFor = plannedFor
  } else {
    const now = new Date()
    const afterDate = after && new Date(after) > now ? new Date(after) : now
    const slot = await getNextAvailableSlot(post.company_id, post.channel as Channel, afterDate)
    if (!slot) {
      return NextResponse.json(
        { error: 'No schedule configured for this channel. Set up a posting schedule in Settings.' },
        { status: 422 },
      )
    }
    // Add random jitter so posts don't all land on the exact scheduled hour
    const jitterMs = (1 + Math.floor(Math.random() * 57)) * 60_000
    scheduledFor = new Date(slot.getTime() + jitterMs).toISOString()
  }

  const { data: updated, error } = await supabase
    .from('posts')
    .update({ status: 'scheduled', scheduled_for: scheduledFor })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(updated)
}
