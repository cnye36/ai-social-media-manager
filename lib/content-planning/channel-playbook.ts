import type { Channel } from '@/types/database'

/** Canonical format for a slot — drives generation (e.g. X thread vs single). */
export type SlotFormat = 'single' | 'thread' | 'standard'

export interface ChannelPlaybook {
  channel: Channel
  label: string
  /** Target posts per week for a full calendar */
  postsPerWeek: { min: number; max: number }
  /** Only channels with intra-day cadence (e.g. X) */
  postsPerDay?: { min: number; max: number }
  /** Share of slots that should use each format (must sum ~1 for channels with formats) */
  formatMix: Partial<Record<SlotFormat, number>>
  bestDays: string[]
  bestHoursUtc: number[]
  schedulingNotes: string
  /** Injected into the planner AI prompt */
  plannerRules: string[]
}

export const CHANNEL_PLAYBOOKS: Record<Channel, ChannelPlaybook> = {
  linkedin: {
    channel: 'linkedin',
    label: 'LinkedIn',
    postsPerWeek: { min: 2, max: 3 },
    formatMix: { standard: 1 },
    bestDays: ['Tuesday', 'Wednesday', 'Thursday'],
    bestHoursUtc: [13, 14, 15],
    schedulingNotes:
      'Max 3 posts per week. Space at least 2 days apart. Never more than 1 post per day.',
    plannerRules: [
      'FREQUENCY: Exactly 2–3 posts per week — never daily. Quality over quantity.',
      'FORMAT: Long-form thought leadership, carousels (note as post_type "carousel"), document posts, or polls. No casual hot takes.',
      'LENGTH: Prefer post_length "long" or "medium" for depth.',
      'TONE: Professional insight, first-person founder/operator voice, specific lessons — not press releases.',
      'TIMING: Tue–Thu mornings US time (13:00–15:00 UTC). One slot per eligible day only.',
      'GOALS: Mix awareness (40%), education (35%), engagement (25%). Promotion max 1× per week.',
    ],
  },

  x: {
    channel: 'x',
    label: 'X (Twitter)',
    postsPerWeek: { min: 14, max: 21 },
    postsPerDay: { min: 2, max: 3 },
    formatMix: { single: 0.65, thread: 0.35 },
    bestDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    bestHoursUtc: [9, 12, 15, 18, 21],
    schedulingNotes:
      '2–3 posts per day, 7 days/week. Stagger same-day posts by 4+ hours. ~35% threads, ~65% single tweets.',
    plannerRules: [
      'FREQUENCY: 2–3 posts PER DAY, every day of the plan — this is the highest-volume channel.',
      'FORMAT MIX: ~65% post_type "single" (one punchy tweet, post_length "short"). ~35% post_type "thread" (post_length "long", 3–7 tweets).',
      'THREADS: Use for tutorials, breakdowns, stories, or listicles. Singles for hot takes, questions, and quick tips.',
      'LENGTH: "short" for singles, "long" for threads — always match format.',
      'TIMING: Spread 2–3 slots across different parts of the day (morning, afternoon, evening UTC). Never stack at the same hour.',
      'GOALS: Heavy engagement + awareness. Avoid hard promotion more than 1–2× per week.',
      'Do NOT plan LinkedIn-style essays — X rewards brevity and personality.',
    ],
  },

  facebook: {
    channel: 'facebook',
    label: 'Facebook',
    postsPerWeek: { min: 3, max: 5 },
    formatMix: { standard: 1 },
    bestDays: ['Wednesday', 'Thursday', 'Friday', 'Saturday'],
    bestHoursUtc: [13, 17, 19],
    schedulingNotes: '3–5 posts per week. Community-first; photos and stories outperform link dumps.',
    plannerRules: [
      'FREQUENCY: 3–5 posts per week (not daily unless a launch week).',
      'FORMAT: Short storytelling, community questions, behind-the-scenes, event/news updates. post_type "community" | "story" | "update".',
      'LENGTH: "short" or "medium" — conversational, warm, accessible.',
      'TONE: Friendly neighbor, not corporate. Ask questions. 0–2 emojis when natural.',
      'TIMING: Wed–Sat, afternoons/evenings (13:00–19:00 UTC). Max 1 post per day.',
      'GOALS: Engagement (50%), awareness (30%), promotion (20%).',
    ],
  },

  reddit: {
    channel: 'reddit',
    label: 'Reddit',
    postsPerWeek: { min: 1, max: 2 },
    formatMix: { standard: 1 },
    bestDays: ['Tuesday', 'Thursday', 'Saturday'],
    bestHoursUtc: [14, 15, 20],
    schedulingNotes: '1–2 authentic posts per week max. Never sound promotional.',
    plannerRules: [
      'FREQUENCY: 1–2 posts per week only — overselling gets downvoted.',
      'FORMAT: Genuine discussion starters, lessons learned, AMA-style questions. post_type "discussion" | "story".',
      'LENGTH: "medium". Must include a discussion question in the topic brief.',
      'TONE: Peer sharing value — zero marketing speak, no hashtags, no CTAs.',
      'TIMING: Tue/Thu/Sat. Never same day as a promotional LinkedIn post on the same topic.',
    ],
  },
}

export function getPlaybook(channel: Channel): ChannelPlaybook {
  return CHANNEL_PLAYBOOKS[channel]
}

/** Per-channel slot targets for a date range */
export function calculateChannelSlotTargets(
  channels: Channel[],
  dayCount: number,
): Record<Channel, number> {
  const weeks = Math.max(dayCount / 7, 1)
  const targets: Partial<Record<Channel, number>> = {}

  for (const channel of channels) {
    const pb = getPlaybook(channel)
    const mid = (pb.postsPerWeek.min + pb.postsPerWeek.max) / 2
    targets[channel] = Math.round(mid * weeks)
  }

  return targets as Record<Channel, number>
}

export function buildPlaybookPromptSection(channels: Channel[]): string {
  return channels
    .map(ch => {
      const pb = getPlaybook(ch)
      const formatLine = pb.formatMix.thread
        ? `Format mix: ${Object.entries(pb.formatMix)
            .map(([f, w]) => `${f} ${Math.round((w ?? 0) * 100)}%`)
            .join(', ')}`
        : 'Format: standard posts only'
      return `### ${pb.label}
- Cadence: ${pb.postsPerWeek.min}–${pb.postsPerWeek.max} posts/week${pb.postsPerDay ? `, ${pb.postsPerDay.min}–${pb.postsPerDay.max} posts/day` : ''}
- ${formatLine}
- ${pb.schedulingNotes}
${pb.plannerRules.map(r => `- ${r}`).join('\n')}`
    })
    .join('\n\n')
}

export function isThreadSlot(channel: Channel, postType: string, postLength: string): boolean {
  if (channel !== 'x') return false
  const t = postType.toLowerCase()
  return t === 'thread' || t.includes('thread') || postLength === 'long'
}

export interface PlannedSlotInput {
  channel: Channel
  scheduled_date: string
  post_type: string
  pillar: string | null
  topic: string
  content_goal: string
  post_length: string
  notes: string | null
}

/** Minimum gap in ms between posts on the same channel to prevent back-to-back publishing. */
const MIN_CHANNEL_GAP_MS = 3 * 60 * 60 * 1000 // 3 hours

/**
 * Stagger times when multiple slots share a channel + day (especially X).
 * Pass existingScheduled (UTC Dates keyed by channel) to avoid conflicts with
 * posts that are already in the database.
 */
export function assignSlotTimes(
  slots: PlannedSlotInput[],
  insights: Record<string, { best_hours_utc: number[] }>,
  existingScheduled: Partial<Record<string, Date[]>> = {},
): { slot: PlannedSlotInput; scheduledFor: Date }[] {
  const byChannelDay = new Map<string, number>()
  // Track times we've just assigned in this batch to detect within-batch conflicts
  const assignedByChannel = new Map<string, Date[]>()

  return slots.map(slot => {
    const date = slot.scheduled_date
    const key = `${slot.channel}:${date}`
    const dayIndex = byChannelDay.get(key) ?? 0
    byChannelDay.set(key, dayIndex + 1)

    const pb = getPlaybook(slot.channel)
    const hours =
      insights[slot.channel]?.best_hours_utc?.length
        ? insights[slot.channel].best_hours_utc
        : pb.bestHoursUtc

    const existingForChannel = [
      ...(existingScheduled[slot.channel] ?? []),
      ...(assignedByChannel.get(slot.channel) ?? []),
    ]

    // Try each candidate hour until we find one that doesn't conflict
    const jitterMinutes = Math.floor(Math.random() * 56)
    let scheduledFor: Date | null = null

    for (let attempt = 0; attempt < hours.length; attempt++) {
      const hour = hours[(dayIndex + attempt) % hours.length]
      const candidate = new Date(`${date}T00:00:00.000Z`)
      candidate.setUTCHours(hour, jitterMinutes, 0, 0)

      const conflicts = existingForChannel.some(
        existing => Math.abs(existing.getTime() - candidate.getTime()) < MIN_CHANNEL_GAP_MS,
      )

      if (!conflicts) {
        scheduledFor = candidate
        break
      }
    }

    // Fall back: pick the hour furthest from any existing assignment to avoid visual clustering
    if (!scheduledFor) {
      const allAssigned = existingForChannel
      const bestHour = hours.reduce((best, h) => {
        const minDist = allAssigned.length
          ? Math.min(...allAssigned.map(d => Math.abs(d.getUTCHours() - h)))
          : Infinity
        const bestDist = allAssigned.length
          ? Math.min(...allAssigned.map(d => Math.abs(d.getUTCHours() - best)))
          : Infinity
        return minDist > bestDist ? h : best
      }, hours[dayIndex % hours.length] ?? pb.bestHoursUtc[0])
      scheduledFor = new Date(`${date}T00:00:00.000Z`)
      scheduledFor.setUTCHours(bestHour, jitterMinutes, 0, 0)
    }

    const prev = assignedByChannel.get(slot.channel) ?? []
    assignedByChannel.set(slot.channel, [...prev, scheduledFor])

    return { slot, scheduledFor }
  })
}
