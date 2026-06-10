import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateRedditWeeklyPlan, type ExistingCalendarPost } from '@/lib/reddit/planner'
import { startOfWeek, addDays, format } from 'date-fns'
import type { BrandProfile, Company } from '@/types/database'

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const { companyId, subreddits, weekStart, topicFocus } = await req.json() as {
    companyId: string
    subreddits: string[]
    weekStart: string
    topicFocus?: string
  }

  if (!companyId || !subreddits?.length || !weekStart) {
    return NextResponse.json(
      { error: 'companyId, subreddits, and weekStart are required' },
      { status: 400 },
    )
  }

  // Derive the Mon–Sun window for the target week
  const monday = startOfWeek(new Date(weekStart), { weekStartsOn: 1 })
  const sunday = addDays(monday, 6)
  const weekFrom = format(monday, "yyyy-MM-dd'T'00:00:00xxx")
  const weekTo   = format(sunday, "yyyy-MM-dd'T'23:59:59xxx")

  const [{ data: company }, { data: brand }, { data: configs }, { data: calPosts }] = await Promise.all([
    supabase.from('companies').select('*').eq('id', companyId).single(),
    supabase.from('brand_profiles').select('*').eq('company_id', companyId).maybeSingle(),
    supabase
      .from('reddit_subreddit_configs')
      .select('subreddit, posting_guidance, notes')
      .eq('company_id', companyId)
      .in('subreddit', subreddits),
    supabase
      .from('posts')
      .select('channel, scheduled_for, content')
      .eq('company_id', companyId)
      .in('status', ['draft', 'scheduled'])
      .gte('scheduled_for', weekFrom)
      .lte('scheduled_for', weekTo),
  ])

  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }

  const subredditConfigs: Record<string, { posting_guidance: string | null; notes: string | null }> = {}
  for (const cfg of configs ?? []) {
    subredditConfigs[cfg.subreddit] = { posting_guidance: cfg.posting_guidance, notes: cfg.notes }
  }

  const existingPosts: ExistingCalendarPost[] = (calPosts ?? []).map(p => ({
    date: format(new Date(p.scheduled_for!), 'yyyy-MM-dd'),
    channel: p.channel as string,
    contentSnippet: (p.content as string).slice(0, 120).replace(/\s+/g, ' ').trim(),
  }))

  try {
    const slots = await generateRedditWeeklyPlan({
      subreddits,
      weekStart,
      topicFocus,
      company: company as Company,
      brand: brand as BrandProfile | null,
      subredditConfigs,
      existingPosts,
    })
    return NextResponse.json({ slots })
  } catch (err) {
    console.error('Reddit planner error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate plan' },
      { status: 500 },
    )
  }
}
