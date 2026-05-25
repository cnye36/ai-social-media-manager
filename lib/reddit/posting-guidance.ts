import OpenAI from 'openai'
import {
  fetchSubredditAbout,
  fetchSubredditRules,
  fetchTrendingPostTitles,
} from '@/lib/reddit/subreddit-meta'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export interface SubredditGuidanceInput {
  subreddit: string
  rulesText?: string | null
  notes?: string | null
  aboutText?: string | null
  trendingTitles?: string[]
}

/** AI-generated playbook: what works, what to avoid, formats, ban risks. */
export async function generatePostingGuidance(
  input: SubredditGuidanceInput
): Promise<string> {
  const sub = input.subreddit.replace(/^r\//, '').toLowerCase()
  const [rulesText, aboutText, trendingTitles] = await Promise.all([
    input.rulesText !== undefined ? Promise.resolve(input.rulesText) : fetchSubredditRules(sub),
    input.aboutText !== undefined ? Promise.resolve(input.aboutText) : fetchSubredditAbout(sub),
    input.trendingTitles !== undefined
      ? Promise.resolve(input.trendingTitles)
      : fetchTrendingPostTitles(sub),
  ])

  const lines: string[] = [
    `Analyze r/${sub} for a brand that wants to participate without removals or bans.`,
    `Produce a concise playbook a writer must follow before drafting any post.`,
    ``,
    `Use these sections exactly (markdown headers):`,
    `## What performs well`,
    `## What to avoid`,
    `## Recommended post formats`,
    `## Self-promotion and product mentions`,
    `## Ban and removal risks`,
    ``,
    `Be specific to r/${sub} — not generic Reddit advice.`,
    `Call out patterns that trigger "submission not allowed" or mod removal (e.g. workflow showcases, links, surveys, low effort, wrong flair).`,
    `If rules ban self-promo, say how to share experience without sounding like an ad.`,
  ]

  if (rulesText) {
    lines.push('', '## Official rules', rulesText)
  }
  if (aboutText) {
    lines.push('', '## Subreddit about / sidebar', aboutText)
  }
  if (input.notes?.trim()) {
    lines.push('', '## Team notes', input.notes.trim())
  }
  if (trendingTitles.length > 0) {
    lines.push('', '## Recent hot posts (study tone and format, do not copy)')
    trendingTitles.forEach((t, i) => lines.push(`${i + 1}. ${t}`))
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-5.4-mini',
    messages: [{ role: 'user', content: lines.join('\n') }],
    temperature: 0.4,
  })

  return response.choices[0]?.message?.content?.trim() ?? ''
}

/** Block injected into generation prompts. */
export function formatSubredditContextForPrompt(params: {
  subreddit: string
  rulesText?: string | null
  notes?: string | null
  postingGuidance?: string | null
}): string {
  const sub = params.subreddit.replace(/^r\//, '')
  const parts: string[] = [
    `TARGET SUBREDDIT: r/${sub}`,
    `You are writing exclusively for r/${sub}. Do not write a generic post that could be cross-posted elsewhere.`,
    `If the post would likely be removed or get "submission not allowed", change the angle until it fits.`,
  ]

  if (params.postingGuidance?.trim()) {
    parts.push('', 'SUBREDDIT PLAYBOOK (follow every section):', params.postingGuidance.trim())
  }
  if (params.rulesText?.trim()) {
    parts.push('', 'OFFICIAL RULES (must comply):', params.rulesText.trim())
  }
  if (params.notes?.trim()) {
    parts.push('', 'TEAM NOTES:', params.notes.trim())
  }

  return parts.join('\n')
}
