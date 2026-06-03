import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { scheduleViaBufferIfConnected } from '@/lib/publishing/buffer-schedule'
import type { Post } from '@/types/database'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const companyId = searchParams.get('companyId')
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const channel = searchParams.get('channel')
  const status = searchParams.get('status')
  const scheduledAfter = searchParams.get('scheduledAfter')
  const scheduledBefore = searchParams.get('scheduledBefore')

  let query = supabase
    .from('posts')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  if (channel) query = query.eq('channel', channel)
  if (status) query = query.eq('status', status)
  if (scheduledAfter) query = query.gte('scheduled_for', scheduledAfter)
  if (scheduledBefore) query = query.lte('scheduled_for', scheduledBefore)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { company_id, channel, content, status, scheduled_for, published_at, media_items, generation_params, content_variants } = body

  if (!company_id || !channel || !content) {
    return NextResponse.json({ error: 'company_id, channel, and content required' }, { status: 400 })
  }

  const { data: company } = await supabase.from('companies').select('id').eq('id', company_id).single()
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  const resolvedStatus = status ?? 'draft'
  const insertRow: Record<string, unknown> = {
    company_id,
    channel,
    content,
    status: resolvedStatus,
    scheduled_for: scheduled_for ?? null,
    media_items: media_items ?? [],
    generation_params: generation_params ?? {},
    content_variants: content_variants ?? {},
  }
  if (resolvedStatus === 'published') {
    insertRow.published_at = published_at ?? new Date().toISOString()
    insertRow.scheduled_for = null
  }

  const { data, error } = await supabase
    .from('posts')
    .insert(insertRow)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (data.status === 'scheduled' && data.scheduled_for && !data.buffer_post_id) {
    try {
      const bufferUpdates = await scheduleViaBufferIfConnected(data as Post)
      if (Object.keys(bufferUpdates).length > 0) {
        const { data: updated, error: updateError } = await supabase
          .from('posts')
          .update(bufferUpdates)
          .eq('id', data.id)
          .select()
          .single()
        if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
        return NextResponse.json(updated, { status: 201 })
      }
    } catch (err) {
      await supabase.from('posts').delete().eq('id', data.id)
      return NextResponse.json({ error: (err as Error).message }, { status: 400 })
    }
  }

  return NextResponse.json(data, { status: 201 })
}
