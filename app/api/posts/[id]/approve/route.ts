import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getNextAvailableSlot } from '@/lib/scheduling/next-slot'
import { scheduleViaBufferIfConnected } from '@/lib/publishing/buffer-schedule'
import type { Channel, Post } from '@/types/database'

const SOCIAL_CHANNELS: Channel[] = ['linkedin', 'x', 'facebook']

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
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

  const slot = await getNextAvailableSlot(post.company_id, post.channel as Channel)
  if (!slot) {
    return NextResponse.json(
      { error: 'No schedule configured for this channel. Set up a posting schedule in Settings.' },
      { status: 422 }
    )
  }

  const scheduledFor = slot.toISOString()
  const scheduledPost = {
    ...post,
    status: 'scheduled',
    scheduled_for: scheduledFor,
  } as Post

  let bufferUpdates: Record<string, unknown> = {}
  try {
    bufferUpdates = await scheduleViaBufferIfConnected(scheduledPost)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }

  const { data: updated, error } = await supabase
    .from('posts')
    .update({ status: 'scheduled', scheduled_for: scheduledFor, ...bufferUpdates })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(updated)
}
