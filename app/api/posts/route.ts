import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
  const { company_id, channel, content, status, scheduled_for, media_items, generation_params, content_variants } = body

  if (!company_id || !channel || !content) {
    return NextResponse.json({ error: 'company_id, channel, and content required' }, { status: 400 })
  }

  const { data: company } = await supabase.from('companies').select('id').eq('id', company_id).single()
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('posts')
    .insert({
      company_id,
      channel,
      content,
      status: status ?? 'draft',
      scheduled_for: scheduled_for ?? null,
      media_items: media_items ?? [],
      generation_params: generation_params ?? {},
      content_variants: content_variants ?? {},
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
