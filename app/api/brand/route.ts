import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const companyId = searchParams.get('companyId')
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .eq('owner_id', user.id)
    .single()
  if (!company) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

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

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .eq('owner_id', user.id)
    .single()
  if (!company) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const {
    tone, voice_notes, target_audience, keywords, avoid_phrases, color_palette, channel_overrides,
    company_description, products_services, value_proposition, ideal_customer_profile,
    pain_points, competitors, geographic_focus, company_stage, team_size,
  } = body

  const payload = {
    tone,
    voice_notes,
    target_audience,
    keywords: keywords ?? [],
    avoid_phrases: avoid_phrases ?? [],
    color_palette: color_palette ?? {},
    channel_overrides: channel_overrides ?? {},
    company_description: company_description ?? null,
    products_services: products_services ?? null,
    value_proposition: value_proposition ?? null,
    ideal_customer_profile: ideal_customer_profile ?? null,
    pain_points: pain_points ?? [],
    competitors: competitors ?? [],
    geographic_focus: geographic_focus ?? null,
    company_stage: company_stage ?? null,
    team_size: team_size ?? null,
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
