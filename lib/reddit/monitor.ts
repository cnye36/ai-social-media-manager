import { createAdminClient } from '@/lib/supabase/admin'

const USER_AGENT = 'social-media-manager/1.0 (by /u/your_reddit_username)'
const REDDIT_BASE = 'https://www.reddit.com'

interface RedditPost {
  id: string        // base36 id, e.g. "abc123"
  name: string      // fullname, e.g. "t3_abc123"
  title: string
  selftext: string
  url: string
  author: string
  score: number
  num_comments: number
  subreddit: string
  created_utc: number
}

async function fetchNewPosts(subreddit: string, after?: string | null): Promise<RedditPost[]> {
  const params = new URLSearchParams({ limit: '100' })
  if (after) params.set('after', after)

  const res = await fetch(`${REDDIT_BASE}/r/${subreddit}/new.json?${params}`, {
    headers: { 'User-Agent': USER_AGENT },
    cache: 'no-store',
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error(`Reddit fetch failed for r/${subreddit}: HTTP ${res.status}`, body.slice(0, 300))
    return []
  }

  const json = await res.json() as { data?: { children?: { data: RedditPost }[] } }
  if (!json?.data?.children) {
    console.error(`Reddit returned unexpected shape for r/${subreddit}:`, JSON.stringify(json).slice(0, 200))
    return []
  }
  return json.data.children.map(c => c.data)
}

function matchesKeywords(post: RedditPost, keywords: string[]): string[] {
  if (keywords.length === 0) return ['*']  // no keywords = catch-all, match every post
  const haystack = `${post.title} ${post.selftext}`.toLowerCase()
  return keywords.filter(kw => haystack.includes(kw.toLowerCase()))
}

export async function runMonitors(companyId?: string): Promise<{ monitorsChecked: number; newOpportunities: number }> {
  const supabase = createAdminClient()

  let query = supabase
    .from('reddit_monitors')
    .select('*')
    .eq('is_active', true)

  if (companyId) query = query.eq('company_id', companyId)

  const { data: monitors, error } = await query
  if (error || !monitors?.length) return { monitorsChecked: 0, newOpportunities: 0 }

  let newOpportunities = 0

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
        const posts = await fetchNewPosts(subreddit, seenIds[subreddit])
        if (!posts.length) continue

        const matched = posts
          .map(post => ({ post, hits: matchesKeywords(post, monitor.keywords) }))
          .filter(({ hits }) => hits.length > 0)

        if (matched.length > 0) {
          const rows = matched.map(({ post, hits }) => ({
            company_id: monitor.company_id,
            monitor_id: monitor.id,
            reddit_post_id: post.name,
            subreddit: post.subreddit,
            title: post.title,
            selftext: post.selftext,
            url: `https://reddit.com${post.url.startsWith('/') ? post.url : '/' + post.id}`,
            author: post.author,
            score: post.score,
            num_comments: post.num_comments,
            matched_keywords: hits,
          }))

          const { error: insertError, data: inserted } = await supabase
            .from('reddit_opportunities')
            .upsert(rows, { onConflict: 'company_id,reddit_post_id', ignoreDuplicates: true })
            .select('id')

          if (!insertError) newOpportunities += inserted?.length ?? matched.length
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

  return { monitorsChecked: monitors.length, newOpportunities }
}

export async function draftReply(opportunityId: string, companyId: string): Promise<string> {
  const supabase = createAdminClient()

  const [{ data: opp }, { data: brand }, { data: config }] = await Promise.all([
    supabase.from('reddit_opportunities').select('*').eq('id', opportunityId).single(),
    supabase.from('brand_profiles').select('*').eq('company_id', companyId).maybeSingle(),
    supabase.from('reddit_subreddit_configs')
      .select('rules_text, notes, reply_policy')
      .eq('company_id', companyId)
      .eq('subreddit', '')  // filled below after opp loads
      .maybeSingle(),
  ])

  if (!opp) throw new Error('Opportunity not found')

  const { data: subConfig } = await supabase
    .from('reddit_subreddit_configs')
    .select('rules_text, notes, reply_policy')
    .eq('company_id', companyId)
    .eq('subreddit', opp.subreddit)
    .maybeSingle()

  const companyName = (brand as { company_name?: string } | null)?.company_name ?? 'our company'
  const brandVoice = (brand as { brand_voice?: string } | null)?.brand_voice ?? ''

  const systemPrompt = [
    `You are a genuine Reddit user who works at ${companyName}.`,
    brandVoice ? `Brand voice: ${brandVoice}` : '',
    `You are replying to a post in r/${opp.subreddit}.`,
    subConfig?.rules_text ? `Subreddit rules:\n${subConfig.rules_text}` : '',
    subConfig?.notes ? `Notes on this subreddit:\n${subConfig.notes}` : '',
    '',
    'Write a reply that:',
    '- Leads with genuine value or insight, not promotion',
    '- Is conversational and first-person',
    '- Mentions the company only if directly and naturally relevant',
    '- Never uses em dashes (—) — they signal AI-generated content',
    '- Is concise (2-4 paragraphs max)',
    '- Does NOT start with "Great question!" or any sycophantic opener',
  ].filter(Boolean).join('\n')

  const userPrompt = `Post title: ${opp.title}\n\nPost body:\n${opp.selftext || '(no body text)'}\n\nWrite your reply:`

  const { OpenAI } = await import('openai')
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const completion = await openai.chat.completions.create({
    model: 'gpt-5.4-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 600,
  })

  const reply = completion.choices[0]?.message?.content?.trim() ?? ''

  await supabase
    .from('reddit_opportunities')
    .update({ draft_reply: reply, status: 'drafted' })
    .eq('id', opportunityId)

  return reply
}
