import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId')
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('reddit_monitors')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { company_id: string; subreddit: string; keywords: string[] }
  if (!body.company_id || !body.subreddit) {
    return NextResponse.json({ error: 'company_id and subreddit required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('reddit_monitors')
    .insert({
      company_id: body.company_id,
      subreddit: body.subreddit.replace(/^r\//, '').trim().toLowerCase(),
      keywords: body.keywords ?? [],
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
