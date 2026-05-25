import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generatePostingGuidance } from '@/lib/reddit/posting-guidance'
import { fetchSubredditRules } from '@/lib/reddit/subreddit-meta'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId')
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('reddit_subreddit_configs')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    company_id: string
    subreddit: string
    notes?: string
    fetch_rules?: boolean
    generate_guidance?: boolean
  }

  if (!body.company_id || !body.subreddit) {
    return NextResponse.json({ error: 'company_id and subreddit required' }, { status: 400 })
  }

  const cleanSub = body.subreddit.trim().replace(/^r\//, '').toLowerCase()
  const fetchRules = body.fetch_rules !== false
  const generateGuidance = body.generate_guidance !== false

  let rules_text: string | null = null
  if (fetchRules) {
    rules_text = await fetchSubredditRules(cleanSub)
  }

  let posting_guidance: string | null = null
  let posting_guidance_updated_at: string | null = null
  if (generateGuidance) {
    try {
      posting_guidance = await generatePostingGuidance({
        subreddit: cleanSub,
        rulesText: rules_text,
        notes: body.notes ?? null,
      })
      if (posting_guidance) posting_guidance_updated_at = new Date().toISOString()
    } catch {
      // Config still created; user can refresh guidance later
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('reddit_subreddit_configs')
    .insert({
      company_id: body.company_id,
      subreddit: cleanSub,
      rules_text,
      notes: body.notes ?? null,
      posting_guidance,
      posting_guidance_updated_at,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Subreddit already configured' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}
