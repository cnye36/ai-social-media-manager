import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface Props {
  params: Promise<{ id: string }>
}

export async function PATCH(request: Request, { params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('id', id)
    .eq('owner_id', user.id)
    .single()
  if (!company) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { name, website_url, account_type } = body

  const updates: Record<string, string | null> = {}
  if (name !== undefined) updates.name = name.trim()
  if (website_url !== undefined) updates.website_url = website_url || null
  if (account_type !== undefined) {
    if (account_type !== 'company' && account_type !== 'founder') {
      return NextResponse.json({ error: 'Invalid account_type' }, { status: 400 })
    }
    updates.account_type = account_type
  }

  const { data, error } = await supabase
    .from('companies')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
