import { createAdminClient } from '@/lib/supabase/admin'
import { preferredStackGuidance } from '@/lib/content-planning/brand-context'
import { fetchNewPosts, type RedditPost } from '@/lib/reddit/fetch-posts'
import type { BrandProfile } from '@/types/database'

const OPPORTUNITY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

function matchesKeywords(post: RedditPost, keywords: string[]): string[] {
  if (keywords.length === 0) return ['*']  // no keywords = catch-all, match every post
  const haystack = `${post.title} ${post.selftext}`.toLowerCase()
  return keywords.filter(kw => haystack.includes(kw.toLowerCase()))
}

function redditPostedAtIso(post: RedditPost): string {
  if (post.created_utc > 0) {
    return new Date(post.created_utc * 1000).toISOString()
  }
  return new Date().toISOString()
}

/** Delete opportunities whose Reddit post is older than one week. */
export async function pruneOldOpportunities(
  supabase: ReturnType<typeof createAdminClient>,
  companyId?: string,
): Promise<number> {
  const cutoff = new Date(Date.now() - OPPORTUNITY_MAX_AGE_MS).toISOString()
  let query = supabase.from('reddit_opportunities').delete().lt('posted_at', cutoff)
  if (companyId) query = query.eq('company_id', companyId)

  const { data, error } = await query.select('id')
  if (error) {
    console.error('Failed to prune old reddit opportunities:', error.message)
    return 0
  }
  return data?.length ?? 0
}

export async function runMonitors(companyId?: string): Promise<{
  monitorsChecked: number
  newOpportunities: number
  pruned?: number
  fetchErrors?: { subreddit: string; status: number; source: string; detail: string }[]
}> {
  const supabase = createAdminClient()

  let query = supabase
    .from('reddit_monitors')
    .select('*')
    .eq('is_active', true)

  if (companyId) query = query.eq('company_id', companyId)

  const { data: monitors, error } = await query
  if (error || !monitors?.length) return { monitorsChecked: 0, newOpportunities: 0 }

  let newOpportunities = 0
  const fetchErrors: { subreddit: string; status: number; source: string; detail: string }[] = []

  for (const monitor of monitors) {
    // Support both old single-subreddit rows and new multi-subreddit rows
    const subreddits: string[] = monitor.subreddits?.length
      ? monitor.subreddits
      : monitor.subreddit
        ? [monitor.subreddit]
        : []

    if (!subreddits.length) continue

    const seenIds: Record<string, string> = monitor.newest_seen_ids ?? {}
    const newSeenIds: Record<string, string> = { ...seenIds }

    for (const subreddit of subreddits) {
      try {
        const result = await fetchNewPosts(subreddit, seenIds[subreddit])
        if (!result.ok) {
          fetchErrors.push({
            subreddit,
            status: result.status,
            source: result.source,
            detail: result.detail,
          })
          console.error(
            `Reddit fetch failed for r/${subreddit}: ${result.source} HTTP ${result.status}`,
            result.detail,
          )
          continue
        }

        const posts = result.posts
        if (!posts.length) continue

        const ageCutoffSec = (Date.now() - OPPORTUNITY_MAX_AGE_MS) / 1000
        const matched = posts
          .map(post => ({ post, hits: matchesKeywords(post, monitor.keywords) }))
          .filter(({ post, hits }) => {
            if (hits.length === 0) return false
            if (post.created_utc > 0 && post.created_utc < ageCutoffSec) return false
            return true
          })

        if (matched.length > 0) {
          const rows = matched.map(({ post, hits }) => ({
            company_id: monitor.company_id,
            monitor_id: monitor.id,
            reddit_post_id: post.name,
            subreddit: post.subreddit,
            title: post.title,
            selftext: post.selftext,
            url: post.url.startsWith('http')
              ? post.url
              : `https://reddit.com${post.url.startsWith('/') ? post.url : '/' + post.id}`,
            author: post.author,
            score: post.score,
            num_comments: post.num_comments,
            matched_keywords: hits,
            posted_at: redditPostedAtIso(post),
          }))

          const { error: insertError, data: inserted } = await supabase
            .from('reddit_opportunities')
            .upsert(rows, { onConflict: 'company_id,reddit_post_id', ignoreDuplicates: true })
            .select('id')

          if (!insertError) newOpportunities += inserted?.length ?? matched.length

          // Keep posted_at accurate when the post was already ingested (upsert skips duplicates)
          await Promise.all(
            rows.map(row =>
              supabase
                .from('reddit_opportunities')
                .update({ posted_at: row.posted_at })
                .eq('company_id', row.company_id)
                .eq('reddit_post_id', row.reddit_post_id),
            ),
          )
        }

        // Advance cursor for this subreddit
        newSeenIds[subreddit] = posts[0].name

        // Stay well within Reddit's rate limits between subreddit fetches
        await new Promise(r => setTimeout(r, 1100))
      } catch (err) {
        console.error(`Monitor error for r/${subreddit}:`, err)
      }
    }

    // Always update the timestamp so the UI reflects activity
    await supabase
      .from('reddit_monitors')
      .update({ last_checked_at: new Date().toISOString() })
      .eq('id', monitor.id)

    // Update per-subreddit cursors — may silently fail if migration hasn't been applied yet
    await supabase
      .from('reddit_monitors')
      .update({ newest_seen_ids: newSeenIds })
      .eq('id', monitor.id)
  }

  const pruned = await pruneOldOpportunities(supabase, companyId)

  return {
    monitorsChecked: monitors.length,
    newOpportunities,
    ...(pruned > 0 ? { pruned } : {}),
    ...(fetchErrors.length ? { fetchErrors } : {}),
  }
}

export async function draftReply(
  opportunityId: string,
  companyId: string,
  additionalContext?: string,
): Promise<string> {
  const supabase = createAdminClient()

  const [{ data: opp }, { data: brand }, { data: company }, { data: config }] = await Promise.all([
    supabase.from('reddit_opportunities').select('*').eq('id', opportunityId).single(),
    supabase.from('brand_profiles').select('*').eq('company_id', companyId).maybeSingle(),
    supabase.from('companies').select('name').eq('id', companyId).single(),
    supabase.from('reddit_subreddit_configs')
      .select('rules_text, notes, posting_guidance, reply_policy')
      .eq('company_id', companyId)
      .eq('subreddit', '')  // filled below after opp loads
      .maybeSingle(),
  ])

  if (!opp) throw new Error('Opportunity not found')

  const { data: subConfig } = await supabase
    .from('reddit_subreddit_configs')
    .select('rules_text, notes, posting_guidance, reply_policy')
    .eq('company_id', companyId)
    .eq('subreddit', opp.subreddit)
    .maybeSingle()

  const companyName = company?.name ?? 'our company'
  const brandProfile = brand as BrandProfile | null
  const stackLine = preferredStackGuidance(brandProfile)

  const contextNote = additionalContext?.trim()

  const systemPrompt = [
    `You are a genuine Reddit user participating in r/${opp.subreddit}.`,
    `You may work at ${companyName}, but you are replying as a helpful community member first.`,
    brandProfile?.voice_notes ? `Voice (subtle): ${brandProfile.voice_notes}` : '',
    brandProfile?.tone ? `Tone: ${brandProfile.tone}` : '',
    stackLine ?? '',
    subConfig?.rules_text ? `Subreddit rules:\n${subConfig.rules_text}` : '',
    subConfig?.posting_guidance ? `Subreddit playbook:\n${subConfig.posting_guidance}` : '',
    subConfig?.notes ? `Notes on this subreddit:\n${subConfig.notes}` : '',
    '',
    'Write a reply that:',
    '- Leads with genuine value, a specific tip, or lived experience — not a pitch',
    '- Does NOT name the company, product, or URL unless the user instructions below explicitly ask you to',
    '- Never says "we at [company]", "our platform", "check us out", or similar marketing language by default',
    '- Is conversational and first-person',
    '- Never uses em dashes (—) — they signal AI-generated content',
    '- Is concise (2-4 short paragraphs max)',
    '- Does NOT start with "Great question!" or any sycophantic opener',
    contextNote
      ? '- Follow the user instructions below; they override default tone when they conflict'
      : '',
  ].filter(Boolean).join('\n')

  const userParts = [
    `Post title: ${opp.title}`,
    `Post body:\n${opp.selftext || '(no body text)'}`,
  ]
  if (contextNote) {
    userParts.push(
      '',
      'User instructions for this reply (follow closely):',
      contextNote,
    )
  }
  userParts.push('', 'Write your reply:')
  const userPrompt = userParts.join('\n')

  const { OpenAI } = await import('openai')
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const completion = await openai.chat.completions.create({
    model: 'gpt-5.4-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
    max_completion_tokens: 600,
  })

  const reply = completion.choices[0]?.message?.content?.trim() ?? ''

  await supabase
    .from('reddit_opportunities')
    .update({ draft_reply: reply, status: 'drafted' })
    .eq('id', opportunityId)

  return reply
}
