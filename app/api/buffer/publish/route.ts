import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { scheduleViaBufferIfConnected } from '@/lib/publishing/buffer-schedule'
import type { Post } from '@/types/database'

const BUFFER_CHANNELS = new Set(['linkedin', 'x', 'facebook'])

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { postId } = await req.json() as { postId?: string }
  if (!postId) return NextResponse.json({ error: 'postId required' }, { status: 400 })

  const { data: post } = await supabase
    .from('posts')
    .select('*')
    .eq('id', postId)
    .single()

  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('id', post.company_id)
    .eq('owner_id', user.id)
    .single()

  if (!company) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!BUFFER_CHANNELS.has(post.channel)) {
    return NextResponse.json({ error: `Buffer does not support ${post.channel}` }, { status: 400 })
  }

  try {
    const bufferUpdates = await scheduleViaBufferIfConnected(post as Post)
    if (!bufferUpdates.buffer_post_id) {
      return NextResponse.json(
        { error: `No Buffer profile connected for ${post.channel}` },
        { status: 400 }
      )
    }

    const updates: Record<string, unknown> = { status: 'scheduled', ...bufferUpdates }

    let updatedPost = post
    if (Object.keys(updates).length > 0) {
      const { data, error } = await supabase
        .from('posts')
        .update(updates)
        .eq('id', postId)
        .select()
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (data) updatedPost = data
    }

    return NextResponse.json({
      success: true,
      platformPostId: bufferUpdates.buffer_post_id,
      scheduledFor: bufferUpdates.scheduled_for,
      post: updatedPost,
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
