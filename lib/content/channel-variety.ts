import type { Channel } from '@/types/database'
import type { Post } from '@/types/database'
import { buildRecentPostsVarietyBlock, collectRecentOpeners, extractOpeningPattern } from './recent-posts'
import { buildXVarietyBlock, pickXHookStyle, type XHookStyle } from './x-variety'

export interface HookStyle {
  id: string
  label: string
  instruction: string
}

const SHARED_BANNED_OPENERS = [
  'At the end of the day',
  "It's no secret",
  "Let's talk about",
  "Here's the thing",
  'The truth is',
  'When it comes to',
  'In today\'s',
]

const FACEBOOK_BANNED_OPENERS = [
  'Ever ',
  'Ever,',
  'Have you ever',
  'Did you ever',
  'Do you ever',
  'Ever wonder',
  'Ever feel',
  'Ever hear',
  'Ever had',
  'Has this ever',
  ...SHARED_BANNED_OPENERS,
]

const LINKEDIN_BANNED_OPENERS = [
  'I am excited to announce',
  'I\'m excited to announce',
  'Thrilled to share',
  'Honored to',
  'Incredibly proud',
  'Delighted to',
  ...SHARED_BANNED_OPENERS,
]

const FACEBOOK_HOOK_STYLES: HookStyle[] = [
  {
    id: 'specific_moment',
    label: 'Specific moment',
    instruction: 'Open with a concrete moment in time — a day, a conversation, something that just happened. No "Ever" questions.',
  },
  {
    id: 'bold_statement',
    label: 'Bold statement',
    instruction: 'Open with a direct, surprising claim. Not a question — a statement people will agree or disagree with.',
  },
  {
    id: 'story_drop',
    label: 'Story drop-in',
    instruction: 'Open mid-story — "A customer called yesterday and…" or "We tried something weird last week."',
  },
  {
    id: 'relatable_frustration',
    label: 'Relatable frustration',
    instruction: 'Open by naming a specific annoyance your audience feels — without starting with "Ever" or "Have you ever".',
  },
  {
    id: 'number_hook',
    label: 'Number hook',
    instruction: 'Open with a specific number, stat, or count that frames the post.',
  },
  {
    id: 'community_shout',
    label: 'Community shout',
    instruction: 'Open by celebrating or calling out your community — a win, a member, a local moment.',
  },
  {
    id: 'contrast',
    label: 'Contrast',
    instruction: 'Open with "Everyone says X…" or "Most people think Y…" then pivot — not an "Ever" question.',
  },
  {
    id: 'mid_conversation',
    label: 'Mid-conversation',
    instruction: 'Open like you are continuing a chat — "OK real talk:", "Can we be honest for a sec?", "Something I keep noticing:"',
  },
  {
    id: 'tip_lead',
    label: 'Tip lead',
    instruction: 'Open with a practical tip or hack — lead with value, not a rhetorical question.',
  },
  {
    id: 'news_update',
    label: 'News/update',
    instruction: 'Open with something new — a launch, milestone, change, or behind-the-scenes reveal.',
  },
]

const LINKEDIN_HOOK_STYLES: HookStyle[] = [
  {
    id: 'counterintuitive',
    label: 'Counterintuitive insight',
    instruction: 'Open with something that challenges conventional wisdom in your industry.',
  },
  {
    id: 'specific_failure',
    label: 'Specific failure',
    instruction: 'Open with a concrete mistake or failure — a number, a date, a decision gone wrong.',
  },
  {
    id: 'data_point',
    label: 'Data point',
    instruction: 'Open with a surprising stat or result from real work.',
  },
  {
    id: 'question',
    label: 'Sharp question',
    instruction: 'Open with a professional question — not generic, tied to a real debate in your field.',
  },
  {
    id: 'confession',
    label: 'Confession',
    instruction: 'Open with an honest admission — first-person, no corporate polish.',
  },
  {
    id: 'before_after',
    label: 'Before/after',
    instruction: 'Open with a vivid before/after contrast in one line.',
  },
  {
    id: 'mid_thought',
    label: 'Mid-thought',
    instruction: 'Open mid-insight — drop the reader into the point without a warm-up line.',
  },
  {
    id: 'myth_bust',
    label: 'Myth bust',
    instruction: 'Open by naming a specific myth or bad advice to push back on.',
  },
]

const REDDIT_HOOK_STYLES: HookStyle[] = [
  {
    id: 'specific_problem',
    label: 'Specific problem',
    instruction: 'Title opens on a concrete problem — not generic "thoughts on X".',
  },
  {
    id: 'fail_first',
    label: 'Fail-first',
    instruction: 'Title leads with what went wrong before the lesson.',
  },
  {
    id: 'curiosity_gap',
    label: 'Curiosity gap',
    instruction: 'Title teases an outcome without giving away the answer.',
  },
  {
    id: 'debate',
    label: 'Debate question',
    instruction: 'Title frames a genuine debate the community has — lowercase casual tone OK.',
  },
  {
    id: 'after_years',
    label: 'After-years',
    instruction: 'Title uses persistence + recent discovery — "after N months of X, I finally…"',
  },
  {
    id: 'hot_take',
    label: 'Hot take',
    instruction: 'Title states an opinion most people in the sub haven\'t heard.',
  },
]

const CHANNEL_HOOK_STYLES: Record<Channel, HookStyle[]> = {
  facebook: FACEBOOK_HOOK_STYLES,
  linkedin: LINKEDIN_HOOK_STYLES,
  reddit: REDDIT_HOOK_STYLES,
  x: [],
}

const CHANNEL_BANNED_OPENERS: Record<Channel, string[]> = {
  facebook: FACEBOOK_BANNED_OPENERS,
  linkedin: LINKEDIN_BANNED_OPENERS,
  reddit: ['Check out our', 'We just launched', ...SHARED_BANNED_OPENERS],
  x: [],
}

export function pickHookStyle(
  channel: Channel,
  recentPosts: Post[] = [],
  rng: () => number = Math.random,
): HookStyle | XHookStyle {
  if (channel === 'x') return pickXHookStyle(rng)

  const styles = CHANNEL_HOOK_STYLES[channel]
  const recentPatterns = new Set(
    collectRecentOpeners(recentPosts).map(o => extractOpeningPattern(o).toLowerCase()),
  )

  const eligible = styles.filter(style => !recentPatterns.has(style.label.toLowerCase().slice(0, 8)))
  const pool = eligible.length > 0 ? eligible : styles
  return pool[Math.floor(rng() * pool.length)]!
}

function formatBannedList(openers: string[]): string {
  return openers.map(o => `"${o}"`).join(', ')
}

function buildChannelHookBlock(
  channel: Channel,
  hookStyle: HookStyle,
  recentPosts: Post[],
): string {
  const staticBanned = CHANNEL_BANNED_OPENERS[channel]
  const dynamicBanned = collectRecentOpeners(recentPosts).map(extractOpeningPattern)
  const allBanned = [...new Set([...staticBanned, ...dynamicBanned])]

  return [
    'VARIETY (mandatory for this post):',
    `- Hook style for THIS post: ${hookStyle.label} — ${hookStyle.instruction}`,
    `- Do NOT start with any of these overused openers: ${formatBannedList(allBanned)}`,
    '- Every post must feel distinct. Vary rhythm, sentence structure, and tone — not the same template with swapped nouns.',
    '- Rotate how you close the post too — do not end every post with the same question shape.',
  ].join('\n')
}

/** Full variety block: hook style + recent-post look-back. Used in generation prompts. */
export function buildChannelVarietyBlock(
  channel: Channel,
  recentPosts: Post[] = [],
  rng: () => number = Math.random,
): string {
  const recentBlock = buildRecentPostsVarietyBlock(channel, recentPosts)
  const parts: string[] = []

  if (channel === 'x') {
    parts.push(buildXVarietyBlock(pickXHookStyle(rng)))
  } else {
    parts.push(buildChannelHookBlock(channel, pickHookStyle(channel, recentPosts, rng) as HookStyle, recentPosts))
  }

  if (recentBlock) parts.push(recentBlock)

  return parts.join('\n\n')
}

export const FACEBOOK_VARIETY_RULES = `
VARIETY (critical — posts must not sound like copies of each other):
- NEVER start with "Ever…", "Have you ever…", "Did you ever…", or any rhetorical "Ever" question. This pattern is overused and reads as AI-generated.
- Rotate openers: specific moments, bold statements, story drop-ins, numbers, community shout-outs, mid-conversation asides, practical tips.
- Each post needs a different hook archetype and a different closing shape.
- Vary emoji placement and sentence rhythm unpredictably.
`.trim()

export const LINKEDIN_VARIETY_RULES = `
VARIETY (critical):
- Rotate hook styles: counterintuitive insight, failure story, data point, sharp question, confession, myth-bust.
- Never open with announcement clichés ("excited to announce", "thrilled to share").
- Vary paragraph rhythm and closing CTA across posts.
`.trim()
