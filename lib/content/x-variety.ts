/** Per-generation variety for X posts — reduces repetitive hooks and hashtag patterns. */

import type { Post } from '@/types/database'
import { collectRecentOpeners, extractOpeningPattern } from './recent-posts'

export interface XHookStyle {
  id: string
  label: string
  instruction: string
}

export const X_HOOK_STYLES: XHookStyle[] = [
  {
    id: 'hot_take',
    label: 'Hot take',
    instruction: 'Open with a bold contrarian claim. No warm-up — lead with the take.',
  },
  {
    id: 'specific_number',
    label: 'Specific number',
    instruction: 'Open with a concrete number, stat, dollar amount, or timeframe that surprises.',
  },
  {
    id: 'question',
    label: 'Question',
    instruction: 'Open with a sharp question that makes someone stop scrolling.',
  },
  {
    id: 'confession',
    label: 'Confession',
    instruction: 'Open with an honest admission or "unpopular truth" — first-person energy.',
  },
  {
    id: 'before_after',
    label: 'Before/after',
    instruction: 'Open with a vivid before/after contrast in a single line.',
  },
  {
    id: 'mid_thought',
    label: 'Mid-thought',
    instruction: 'Open mid-thought — drop the reader straight into the insight, no "Most teams" setup.',
  },
  {
    id: 'myth_bust',
    label: 'Myth bust',
    instruction: 'Open by naming a specific myth, mistake, or bad advice to push back on.',
  },
  {
    id: 'micro_story',
    label: 'Micro-story',
    instruction: 'Open with a one-sentence micro-story ("Last Tuesday…", "A client asked me…").',
  },
  {
    id: 'definition_flip',
    label: 'Definition flip',
    instruction: 'Open by redefining something everyone thinks they understand.',
  },
  {
    id: 'provocation',
    label: 'Provocation',
    instruction: 'Open with a short provocative statement that demands a reaction.',
  },
]

/** Openers that read as generic AI/B2B copy — never start a tweet with these. */
export const BANNED_X_OPENERS = [
  'Most teams',
  'Many teams',
  'Most companies',
  'Many companies',
  'Most businesses',
  'Many businesses',
  'In today\'s',
  'It\'s no secret',
  'Let\'s talk about',
  'Here\'s the thing',
  'The truth is',
  'At the end of the day',
  'When it comes to',
]

export function pickXHookStyle(recentPosts: Post[] = [], rng: () => number = Math.random): XHookStyle {
  const recentPatterns = new Set(
    collectRecentOpeners(recentPosts).map(o => extractOpeningPattern(o).toLowerCase()),
  )
  const eligible = X_HOOK_STYLES.filter(style => !recentPatterns.has(style.label.toLowerCase().slice(0, 8)))
  const pool = eligible.length > 0 ? eligible : X_HOOK_STYLES
  const index = Math.floor(rng() * pool.length)
  return pool[index]!
}

export function buildXVarietyBlock(hookStyle: XHookStyle): string {
  const banned = BANNED_X_OPENERS.map(o => `"${o}"`).join(', ')
  return [
    'VARIETY (mandatory for this post):',
    `- Hook style for THIS tweet: ${hookStyle.label} — ${hookStyle.instruction}`,
    `- Do NOT start with any of these overused openers: ${banned}`,
    '- Every post must feel distinct. Vary rhythm, sentence structure, and tone — not the same template with swapped nouns.',
    '- Hashtags: pick 0–2 tags that match THIS specific angle and what people actually search on X. Brand keywords are for prose, not default hashtags.',
    '- Skip hashtags entirely when the tweet is strong enough without them — that is often the best choice on X.',
    '- Never default to a single brand keyword as the only hashtag (e.g. do not slap #aiautomation on every post).',
  ].join('\n')
}

export const X_HASHTAG_RULES = `
HASHTAG RULES (X):
- Brand keywords are themes to weave into the copy — they are NOT your default hashtag list.
- Use 0–2 hashtags. Zero is often best for hot takes and replies-style posts.
- When you use hashtags, pick tags specific to THIS post's angle (the tool, workflow, industry moment, or debate) — not the same tag every time.
- Prefer tags people actually follow on X for this topic. Mix broad discovery tags with niche ones when relevant.
- Never end every post with the same single hashtag.
`.trim()

export const X_VARIETY_RULES = `
VARIETY (critical — posts must not sound like copies of each other):
- Rotate how you open tweets. Never fall back on "Most teams…", "Many companies…", or similar generic B2B setups.
- Each post should use a different hook archetype: hot take, question, stat, confession, myth-bust, micro-story, mid-thought drop-in, etc.
- Vary sentence length and rhythm unpredictably. Some posts short and punchy, others one flowing thought.
- Do not reuse the same closing pattern (e.g. ending every tweet with the same CTA shape or hashtag placement).
`.trim()

export const X_ANTI_FORMULA_RULES = `
NEVER LABEL THE TECHNIQUE:
Execute the hook — do not announce it. Never open with the literal name of the device you're using: no "Confession:", "Hot take:", "Unpopular opinion:", "Real talk:", "Plot twist:", "Fun fact:". State the thing itself; the reader recognizes what kind of statement it is without being told.

MAKE A PROMISE, DON'T ASK FOR PATIENCE:
A contract opener that states what's coming ("Here's what 90 days taught me:", "3 things nobody tells you about X:") is good — it IS the value. Never pad a post with an empty instruction to keep reading instead of adding value now: avoid "read this," "keep scrolling," "stick around," "we'll show you" as a stand-alone move. If you promise something, make the promise specific enough that it earns the next line on its own.
`.trim()

export const X_EXAMPLES_SINGLE = `
CALIBRATION EXAMPLES (write your own for the real topic — never reuse these):

BAD (labels the technique, generic phrasing):
"Real confession: we used to think a stuffed help center meant support was covered. Nope. It meant the answers were hiding."

GOOD (same idea, no label, concrete and complete in one breath):
"We had 400 help articles and support tickets kept climbing anyway. A stuffed help center isn't coverage, it's a filing cabinet nobody opens."
`.trim()

export const X_EXAMPLES_THREAD = `
CALIBRATION EXAMPLES (write your own for the real topic — never reuse these):

BAD tweet 1 (labels the technique, tells the reader to keep reading instead of adding value):
"Real confession: we used to think a stuffed help center meant support was covered. Nope. It meant the answers were hiding. Read this and we'll show the before-and-after fix."

GOOD tweet 1 (specific promise, no label, no instruction to keep reading):
"We cut support ticket volume 34% by deleting two-thirds of our help center. Here's what we kept, what we killed, and the one article that now does the work of forty."
`.trim()
