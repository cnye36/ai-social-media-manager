import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generatePostingGuidance } from '@/lib/reddit/posting-guidance'

export const maxDuration = 60

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: config, error: fetchError } = await supabase
    .from('reddit_subreddit_configs')
    .select('id, company_id, subreddit, rules_text, notes')
    .eq('id', id)
    .single()

  if (fetchError || !config) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('id', config.company_id)
    .eq('owner_id', user.id)
    .single()

  if (!company) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let posting_guidance: string
  try {
    posting_guidance = await generatePostingGuidance({
      subreddit: config.subreddit,
      rulesText: config.rules_text,
      notes: config.notes,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate guidance' },
      { status: 500 }
    )
  }

  const { data, error } = await supabase
    .from('reddit_subreddit_configs')
    .update({
      posting_guidance,
      posting_guidance_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
