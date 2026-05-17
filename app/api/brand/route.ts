import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const companyId = searchParams.get('companyId')
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('brand_profiles')
    .select('*')
    .eq('company_id', companyId)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PUT(request: Request) {
  const { searchParams } = new URL(request.url)
  const companyId = searchParams.get('companyId')
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { tone, voice_notes, target_audience, keywords, avoid_phrases, color_palette, channel_overrides } = body

  const payload = {
    tone,
    voice_notes,
    target_audience,
    keywords: keywords ?? [],
    avoid_phrases: avoid_phrases ?? [],
    color_palette: color_palette ?? {},
    channel_overrides: channel_overrides ?? {},
  }

  const { data: updated, error: updateError } = await supabase
    .from('brand_profiles')
    .update(payload)
    .eq('company_id', companyId)
    .select()
    .maybeSingle()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  if (updated) return NextResponse.json(updated)

  const { data: inserted, error: insertError } = await supabase
    .from('brand_profiles')
    .insert({ company_id: companyId, ...payload })
    .select()
    .single()

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
  return NextResponse.json(inserted)
}
