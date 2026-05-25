import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ownership = await verifyOwnership(supabase, id, user.id)
  if (ownership === 'not_found') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (ownership === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabase.from('posts').select('*').eq('id', id).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

async function verifyOwnership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  postId: string,
  userId: string
): Promise<'not_found' | 'forbidden' | 'ok'> {
  const { data: post } = await supabase
    .from('posts')
    .select('company_id')
    .eq('id', postId)
    .single()
  if (!post) return 'not_found'

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('id', post.company_id)
    .eq('owner_id', userId)
    .single()
  return company ? 'ok' : 'forbidden'
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ownership = await verifyOwnership(supabase, id, user.id)
  if (ownership === 'not_found') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (ownership === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { content, status, scheduled_for, published_at, media_items, content_variants } = body

  const updates: Record<string, unknown> = {}
  if (content !== undefined) updates.content = content
  if (media_items !== undefined) updates.media_items = media_items
  if (content_variants !== undefined) updates.content_variants = content_variants

  if (status !== undefined) {
    updates.status = status
    if (status === 'published') {
      updates.published_at = published_at ?? new Date().toISOString()
      updates.scheduled_for = null
    } else if (status === 'draft' || status === 'archived') {
      if (scheduled_for !== undefined) updates.scheduled_for = scheduled_for
      else updates.scheduled_for = null
    } else if (status === 'scheduled') {
      if (scheduled_for !== undefined) updates.scheduled_for = scheduled_for
    }
  } else if (scheduled_for !== undefined) {
    updates.scheduled_for = scheduled_for
  }

  if (status !== 'published' && published_at !== undefined) {
    updates.published_at = published_at
  }

  const { data, error } = await supabase
    .from('posts')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ownership = await verifyOwnership(supabase, id, user.id)
  if (ownership === 'not_found') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (ownership === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await supabase.from('posts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
