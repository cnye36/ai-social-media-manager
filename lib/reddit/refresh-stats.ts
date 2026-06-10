import { createAdminClient } from '@/lib/supabase/admin'

const OPPORTUNITY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const BATCH_SIZE = 100
const USER_AGENT =
  process.env.REDDIT_USER_AGENT ??
  'social-media-manager/1.0 (read-only; +https://github.com)'

interface RedditInfoItem {
  name: string
  score: number
  num_comments: number
  created_utc: number
}

async function fetchRedditInfo(names: string[]): Promise<Map<string, RedditInfoItem>> {
  const result = new Map<string, RedditInfoItem>()

  for (let i = 0; i < names.length; i += BATCH_SIZE) {
    const batch = names.slice(i, i + BATCH_SIZE)
    try {
      const res = await fetch(
        `https://www.reddit.com/api/info.json?id=${batch.join(',')}`,
        { headers: { 'User-Agent': USER_AGENT }, cache: 'no-store' },
      )
      if (!res.ok) continue

      const json = await res.json() as {
        data?: { children?: Array<{ data: Record<string, unknown> }> }
      }

      for (const child of json.data?.children ?? []) {
        const d = child.data
        const name = String(d.name ?? '')
        if (!name) continue
        result.set(name, {
          name,
          score: Number(d.score ?? 0),
          num_comments: Number(d.num_comments ?? 0),
          created_utc: Number(d.created_utc ?? 0),
        })
      }
    } catch {
      // skip failed batch, continue with next
    }

    if (i + BATCH_SIZE < names.length) {
      await new Promise(r => setTimeout(r, 1100))
    }
  }

  return result
}

/** Refresh score, num_comments, and posted_at for recent opportunities via Reddit's /api/info. */
export async function refreshOpportunityStats(companyId: string): Promise<{ updated: number }> {
  const supabase = createAdminClient()
  const cutoff = new Date(Date.now() - OPPORTUNITY_MAX_AGE_MS).toISOString()

  const { data: opps, error } = await supabase
    .from('reddit_opportunities')
    .select('id, reddit_post_id')
    .eq('company_id', companyId)
    .gte('posted_at', cutoff)

  if (error || !opps?.length) return { updated: 0 }

  const names = opps.map(o => o.reddit_post_id).filter(Boolean)
  const infoMap = await fetchRedditInfo(names)

  let updated = 0

  await Promise.all(
    opps.map(async opp => {
      const info = infoMap.get(opp.reddit_post_id)
      if (!info) return

      const patch: Record<string, unknown> = {
        score: info.score,
        num_comments: info.num_comments,
      }
      if (info.created_utc > 0) {
        patch.posted_at = new Date(info.created_utc * 1000).toISOString()
      }

      const { error: updateError } = await supabase
        .from('reddit_opportunities')
        .update(patch)
        .eq('id', opp.id)

      if (!updateError) updated++
    }),
  )

  return { updated }
}
