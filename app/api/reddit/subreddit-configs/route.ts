import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
  }

  if (!body.company_id || !body.subreddit) {
    return NextResponse.json({ error: 'company_id and subreddit required' }, { status: 400 })
  }

  const cleanSub = body.subreddit.trim().replace(/^r\//, '').toLowerCase()
  const fetchRules = body.fetch_rules !== false

  let rules_text: string | null = null
  if (fetchRules) {
    rules_text = await fetchSubredditRules(cleanSub)
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('reddit_subreddit_configs')
    .insert({
      company_id: body.company_id,
      subreddit: cleanSub,
      rules_text,
      notes: body.notes ?? null,
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

async function fetchSubredditRules(sub: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.reddit.com/r/${sub}/about/rules.json`, {
      headers: { 'User-Agent': 'social-media-manager-bot/1.0' },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return null
    const data = await res.json() as {
      rules?: Array<{ short_name: string; description: string; kind: string }>
    }
    if (!data.rules?.length) return null
    return data.rules
      .map((r, i) =>
        `${i + 1}. **${r.short_name}**${r.description ? ': ' + r.description.replace(/\n+/g, ' ').trim().slice(0, 300) : ''}`
      )
      .join('\n')
  } catch {
    return null
  }
}
