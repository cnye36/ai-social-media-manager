import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId')
  const status = req.nextUrl.searchParams.get('status') // optional filter
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

  const supabase = await createClient()
  let query = supabase
    .from('reddit_opportunities')
    .select('*')
    .eq('company_id', companyId)
    .order('posted_at', { ascending: false })
    .limit(100)

  if (status === 'new') {
    // Legacy "drafted" rows were auto-set before reply selection; treat as still new
    query = query.in('status', ['new', 'drafted'])
  } else if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}
