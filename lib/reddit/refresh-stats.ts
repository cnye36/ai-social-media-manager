import { createAdminClient } from '@/lib/supabase/admin'
import { fetchNewPosts } from '@/lib/reddit/fetch-posts'

const OPPORTUNITY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

function redditPostedAtIso(createdUtc: number): string {
  if (createdUtc > 0) return new Date(createdUtc * 1000).toISOString()
  return new Date().toISOString()
}

/** Re-sync original Reddit post times from public RSS for recent opportunities. */
export async function refreshOpportunityStats(companyId: string): Promise<{ updated: number }> {
  const supabase = createAdminClient()
  const cutoff = new Date(Date.now() - OPPORTUNITY_MAX_AGE_MS).toISOString()

  const { data: opps, error } = await supabase
    .from('reddit_opportunities')
    .select('id, reddit_post_id, subreddit')
    .eq('company_id', companyId)
    .gte('posted_at', cutoff)

  if (error || !opps?.length) return { updated: 0 }

  const bySub = new Map<string, { id: string; reddit_post_id: string }[]>()
  for (const opp of opps) {
    const list = bySub.get(opp.subreddit) ?? []
    list.push({ id: opp.id, reddit_post_id: opp.reddit_post_id })
    bySub.set(opp.subreddit, list)
  }

  let updated = 0

  for (const [subreddit, subOpps] of bySub) {
    const result = await fetchNewPosts(subreddit)
    if (!result.ok) continue

    const timeByName = new Map(
      result.posts.map(p => [p.name, redditPostedAtIso(p.created_utc)]),
    )

    await Promise.all(
      subOpps.map(async opp => {
        const postedAt = timeByName.get(opp.reddit_post_id)
        if (!postedAt) return
        const { error: updateError } = await supabase
          .from('reddit_opportunities')
          .update({ posted_at: postedAt })
          .eq('id', opp.id)
        if (!updateError) updated++
      }),
    )

    await new Promise(r => setTimeout(r, 1100))
  }

  return { updated }
}
