import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { name, website_url } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Company name is required' }, { status: 400 })
  }

  const baseSlug = slugify(name)
  let slug = baseSlug
  let attempt = 0
  const MAX_SLUG_ATTEMPTS = 100

  while (attempt <= MAX_SLUG_ATTEMPTS) {
    const { data: existing } = await supabase.from('companies').select('id').eq('slug', slug).single()
    if (!existing) break
    attempt++
    slug = `${baseSlug}-${attempt}`
  }

  if (attempt > MAX_SLUG_ATTEMPTS) {
    return NextResponse.json({ error: 'Could not generate a unique company slug' }, { status: 500 })
  }

  const { data: company, error } = await supabase
    .from('companies')
    .insert({ name: name.trim(), slug, website_url: website_url ?? null, owner_id: user.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Create empty brand profile
  await supabase.from('brand_profiles').insert({ company_id: company.id })

  return NextResponse.json(company, { status: 201 })
}
