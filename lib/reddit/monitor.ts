import { createAdminClient } from '@/lib/supabase/admin'
import { NO_EM_DASH_INSTRUCTION, stripEmDashes } from '@/lib/content/no-em-dash'
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

export interface ReplyVariant {
  approach: 'direct' | 'constraint' | 'experience' | 'contrarian'
  label: string
  text: string
}

/** Shared helper that loads opportunity + subreddit config for drafting. */
async function loadReplyContext(opportunityId: string, companyId: string) {
  const supabase = createAdminClient()

  const [{ data: opp }, { data: brand }, { data: company }] = await Promise.all([
    supabase.from('reddit_opportunities').select('*').eq('id', opportunityId).single(),
    supabase.from('brand_profiles').select('*').eq('company_id', companyId).maybeSingle(),
    supabase.from('companies').select('name').eq('id', companyId).single(),
  ])

  if (!opp) throw new Error('Opportunity not found')

  const { data: subConfig } = await supabase
    .from('reddit_subreddit_configs')
    .select('rules_text, notes, posting_guidance, reply_policy')
    .eq('company_id', companyId)
    .eq('subreddit', opp.subreddit)
    .maybeSingle()

  return {
    supabase,
    opp,
    brand: brand as BrandProfile | null,
    companyName: company?.name ?? 'our company',
    subConfig,
  }
}

export async function draftReplyVariants(
  opportunityId: string,
  companyId: string,
  additionalContext?: string,
): Promise<ReplyVariant[]> {
  const { supabase, opp, brand, companyName, subConfig } = await loadReplyContext(opportunityId, companyId)
  const stackLine = preferredStackGuidance(brand)
  const contextNote = additionalContext?.trim()

  const contextLines: string[] = [
    `You are a genuine Reddit user participating in r/${opp.subreddit}.`,
    `You may work at ${companyName}, but you are replying as a helpful community member first.`,
    brand?.voice_notes ? `Voice (subtle): ${brand.voice_notes}` : '',
    brand?.tone ? `Tone: ${brand.tone}` : '',
    stackLine ?? '',
    subConfig?.rules_text ? `Subreddit rules:\n${subConfig.rules_text}` : '',
    subConfig?.posting_guidance ? `Subreddit playbook:\n${subConfig.posting_guidance}` : '',
    subConfig?.notes ? `Notes on this subreddit:\n${subConfig.notes}` : '',
  ].filter(Boolean)

  const systemPrompt = [
    ...contextLines,
    '',
    'Generate 4 distinctly different replies to the post below. Each must take a different approach in length, structure, and angle.',
    '',
    'APPROACH DEFINITIONS:',
    '- direct: Short (1-3 sentences max). Lead immediately with the answer or the most useful thing you can say. One honest caveat if needed. No filler. Peer tone, not customer service.',
    '- constraint: Start with "it depends" and name the exact dependency that changes the advice. Give conditional guidance. End with a clarifying question that would actually change your recommendation.',
    '- experience: Lead with bounded personal experience — be specific ("In SaaS with sub-100 customers...", "Last time I dealt with X..."). Include one concrete detail (a metric, a timeline, a failure). Add a caveat for when the advice breaks down.',
    '- contrarian: Take the unexpected angle — challenge the premise, give a negative recommendation ("I wouldn\'t do X until..."), or reframe the problem entirely. Can be short or long. Must have one honest caveat.',
    '',
    'ALL replies must:',
    '- Be conversational and first-person',
    '- NOT start with "Great question!" or any sycophantic opener',
    '- NOT name any company, product URL, or use marketing language',
    '- Have meaningfully different lengths and structures from each other',
    '- Feel like they come from different kinds of practitioners, not the same voice',
    `- ${NO_EM_DASH_INSTRUCTION}`,
    contextNote ? `- Also follow these user instructions: ${contextNote}` : '',
    '',
    'Return JSON only:',
    `{
  "replies": [
    { "approach": "direct", "label": "Direct & specific", "text": "..." },
    { "approach": "constraint", "label": "Constraint-first", "text": "..." },
    { "approach": "experience", "label": "Lived experience", "text": "..." },
    { "approach": "contrarian", "label": "Unexpected angle", "text": "..." }
  ]
}`,
  ].filter(Boolean).join('\n')

  const userPrompt = [
    `Post title: ${opp.title}`,
    `Post body:\n${opp.selftext || '(no body text)'}`,
    '',
    'Write 4 reply variants (JSON only):',
  ].join('\n')

  const { OpenAI } = await import('openai')
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const completion = await openai.chat.completions.create({
    model: 'gpt-5.4-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.85,
    max_completion_tokens: 1200,
  })

  const raw = completion.choices[0]?.message?.content ?? '{}'
  let variants: ReplyVariant[] = []
  try {
    const parsed = JSON.parse(raw) as { replies?: ReplyVariant[] }
    variants = (parsed.replies ?? []).map(v => ({
      ...v,
      text: stripEmDashes(v.text ?? ''),
    }))
  } catch {
    throw new Error('Failed to parse reply variants')
  }

  return variants
}

export async function draftReply(
  opportunityId: string,
  companyId: string,
  additionalContext?: string,
): Promise<string> {
  const { supabase, opp, brand, companyName, subConfig } = await loadReplyContext(opportunityId, companyId)
  const stackLine = preferredStackGuidance(brand)
  const contextNote = additionalContext?.trim()

  const systemPrompt = [
    `You are a genuine Reddit user participating in r/${opp.subreddit}.`,
    `You may work at ${companyName}, but you are replying as a helpful community member first.`,
    brand?.voice_notes ? `Voice (subtle): ${brand.voice_notes}` : '',
    brand?.tone ? `Tone: ${brand.tone}` : '',
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
    `- ${NO_EM_DASH_INSTRUCTION}`,
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

  const reply = stripEmDashes(completion.choices[0]?.message?.content?.trim() ?? '')

  await supabase
    .from('reddit_opportunities')
    .update({ draft_reply: reply })
    .eq('id', opportunityId)

  return reply
}
