import type { SupabaseClient } from '@supabase/supabase-js'
import { formatSubredditContextForPrompt } from '@/lib/reddit/posting-guidance'

export interface RedditSubredditConfigRow {
  id: string
  company_id: string
  subreddit: string
  rules_text: string | null
  notes: string | null
  posting_guidance: string | null
  posting_guidance_updated_at: string | null
  updated_at: string
}

export async function loadSubredditConfig(
  supabase: SupabaseClient,
  companyId: string,
  subreddit: string
): Promise<RedditSubredditConfigRow | null> {
  const cleanSub = subreddit.replace(/^r\//, '').toLowerCase()
  const { data } = await supabase
    .from('reddit_subreddit_configs')
    .select('id, company_id, subreddit, rules_text, notes, posting_guidance, posting_guidance_updated_at, updated_at')
    .eq('company_id', companyId)
    .eq('subreddit', cleanSub)
    .maybeSingle()

  return data as RedditSubredditConfigRow | null
}

export function buildSubredditPromptBlock(
  config: RedditSubredditConfigRow | null,
  subreddit: string
): string | null {
  if (!config && !subreddit.trim()) return null
  const cleanSub = (config?.subreddit ?? subreddit).replace(/^r\//, '')
  return formatSubredditContextForPrompt({
    subreddit: cleanSub,
    rulesText: config?.rules_text,
    notes: config?.notes,
    postingGuidance: config?.posting_guidance,
  })
}
