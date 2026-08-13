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

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Minimum gap in ms between posts on the same channel to prevent back-to-back publishing. */
const MIN_CHANNEL_GAP_MS = 3 * 60 * 60 * 1000 // 3 hours

export interface CalendarSlot {
  channel: Channel
  scheduledFor: Date
  calendarDate: string
}

function eachISODate(startDate: string, endDate: string): string[] {
  const dates: string[] = []
  let cur = startDate
  while (cur <= endDate) {
    dates.push(cur)
    const next = new Date(`${cur}T00:00:00.000Z`)
    next.setUTCDate(next.getUTCDate() + 1)
    cur = next.toISOString().slice(0, 10)
  }
  return dates
}

function conflicts(candidate: Date, existing: Date[]): boolean {
  return existing.some(e => Math.abs(e.getTime() - candidate.getTime()) < MIN_CHANNEL_GAP_MS)
}

function playbookCandidates(
  channel: Channel,
  startDate: string,
  endDate: string,
  insights: { best_days?: string[]; best_hours_utc?: number[] } | undefined,
  now: Date,
): CalendarSlot[] {
  const pb = getPlaybook(channel)
  const dayNames = insights?.best_days?.length ? insights.best_days : pb.bestDays
  const hours = insights?.best_hours_utc?.length ? insights.best_hours_utc : pb.bestHoursUtc
  const maxPerDay = pb.postsPerDay?.max ?? 1
  const hoursForDay = hours.slice(0, maxPerDay)

  const slots: CalendarSlot[] = []
  for (const calendarDate of eachISODate(startDate, endDate)) {
    const name = DAY_NAMES[new Date(`${calendarDate}T00:00:00.000Z`).getUTCDay()]
    if (!dayNames.includes(name)) continue
    for (const hour of hoursForDay) {
      const scheduledFor = new Date(`${calendarDate}T00:00:00.000Z`)
      scheduledFor.setUTCHours(hour, 0, 0, 0)
      if (scheduledFor > now) slots.push({ channel, scheduledFor, calendarDate })
    }
  }
  return slots
}

function capByCadence(slots: CalendarSlot[], channel: Channel): CalendarSlot[] {
  const pb = getPlaybook(channel)
  const maxPerDay = pb.postsPerDay?.max ?? 1
  const maxPerWeek = pb.postsPerWeek.max

  const byDay = new Map<string, CalendarSlot[]>()
  for (const slot of slots) {
    const list = byDay.get(slot.calendarDate) ?? []
    list.push(slot)
    byDay.set(slot.calendarDate, list)
  }

  const perDayCapped: CalendarSlot[] = []
  for (const day of [...byDay.keys()].sort()) {
    perDayCapped.push(...(byDay.get(day) ?? []).slice(0, maxPerDay))
  }

  const result: CalendarSlot[] = []
  for (const slot of perDayCapped) {
    const weekAgo = slot.scheduledFor.getTime() - 7 * 24 * 60 * 60 * 1000
    const inWindow = result.filter(
      r => r.scheduledFor.getTime() > weekAgo && r.scheduledFor.getTime() <= slot.scheduledFor.getTime(),
    )
    if (inWindow.length < maxPerWeek) result.push(slot)
  }
  return result
}

function pickEvenly<T>(items: T[], count: number): T[] {
  if (count >= items.length) return items
  if (count <= 0) return []
  const picked: T[] = []
  const used = new Set<number>()
  for (let i = 0; i < count; i++) {
    const idx = Math.min(Math.floor((i + 0.5) * (items.length / count)), items.length - 1)
    let chosen = idx
    while (used.has(chosen) && chosen < items.length - 1) chosen++
    if (used.has(chosen)) {
      chosen = idx
      while (used.has(chosen) && chosen > 0) chosen--
    }
    if (used.has(chosen)) continue
    used.add(chosen)
    picked.push(items[chosen])
  }
  return picked
}

function targetCount(channel: Channel, dayCount: number, available: number): number {
  const pb = getPlaybook(channel)
  const weeks = dayCount / 7
  const mid = Math.round(((pb.postsPerWeek.min + pb.postsPerWeek.max) / 2) * weeks)
  return Math.min(Math.max(mid, available > 0 && mid === 0 ? 1 : mid), available)
}

/**
 * Build the exact posting times that fit inside [startDate, endDate].
 * Prefers the company's configured schedule slots; falls back to playbook
 * best days/hours. Drops anything in the past, already booked, or over cadence.
 */
export function selectCalendarSlots(params: {
  channels: Channel[]
  startDate: string
  endDate: string
  /** Pre-expanded company schedule times keyed by channel. Empty/missing → playbook times. */
  scheduleSlots: Partial<Record<Channel, CalendarSlot[]>>
  insights: Record<string, { best_days: string[]; best_hours_utc: number[] }>
  existingScheduled: Partial<Record<string, Date[]>>
  now?: Date
}): CalendarSlot[] {
  const {
    channels, startDate, endDate, scheduleSlots, insights, existingScheduled,
  } = params
  const now = params.now ?? new Date()
  if (endDate < startDate) return []

  const dayCount = eachISODate(startDate, endDate).length
  const selected: CalendarSlot[] = []

  for (const channel of channels) {
    const booked = existingScheduled[channel] ?? []
    const fromSchedule = scheduleSlots[channel] ?? []
    const available = (fromSchedule.length > 0
      ? fromSchedule
      : playbookCandidates(channel, startDate, endDate, insights[channel], now)
    ).filter(s =>
      s.calendarDate >= startDate &&
      s.calendarDate <= endDate &&
      s.scheduledFor > now &&
      !conflicts(s.scheduledFor, booked),
    )

    const preferredDays = new Set(
      (insights[channel]?.best_days?.length
        ? insights[channel].best_days
        : getPlaybook(channel).bestDays),
    )
    const preferredHours = new Set(
      insights[channel]?.best_hours_utc?.length
        ? insights[channel].best_hours_utc
        : getPlaybook(channel).bestHoursUtc,
    )
    const preferred = available.filter(s => {
      const dayName = DAY_NAMES[new Date(`${s.calendarDate}T00:00:00.000Z`).getUTCDay()]
      const hour = s.scheduledFor.getUTCHours()
      return preferredDays.has(dayName) || preferredHours.has(hour)
    })

    const target = targetCount(channel, dayCount, available.length)
    const pool = preferred.length >= target ? preferred : available
    const capped = capByCadence(pool, channel)
    selected.push(...pickEvenly(capped, Math.min(target, capped.length)))
  }

  return selected.sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime())
}

/** True if a UTC instant's calendar date (YYYY-MM-DD of the slot) is in range. */
export function slotIsInRange(slot: CalendarSlot, startDate: string, endDate: string): boolean {
  return slot.calendarDate >= startDate && slot.calendarDate <= endDate
}
