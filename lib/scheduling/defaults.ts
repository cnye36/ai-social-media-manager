import type { Channel } from '@/types/database'

export const DEFAULT_TIMEZONE = 'America/New_York'
export const BUFFER_QUEUE_LIMIT = 10

type SlotDef = { day_of_week: number; hour: number; minute: number }

// Prime-time defaults per channel (day_of_week: 0=Sun … 6=Sat)
//
// X/Twitter: 4 posts/day every day → 28 slots/week.
//   10 Buffer slots ≈ 2.5 days of coverage. Queue must refill every 2-3 days.
//
// LinkedIn: 1 post/day Mon–Fri → 5 slots/week.
//   10 Buffer slots ≈ 2 weeks of coverage. Very relaxed refill cadence.
//
// Facebook: 2 posts/day Mon–Sat → 12 slots/week.
//   10 Buffer slots ≈ 5 days of coverage.

// Expand a list of times across the given days of week
function expand(days: number[], times: [number, number][]): SlotDef[] {
  return days.flatMap(d => times.map(([h, m]) => ({ day_of_week: d, hour: h, minute: m })))
}

export const DEFAULT_SCHEDULES: Partial<Record<Channel, SlotDef[]>> = {
  // LinkedIn: professional cadence, one post per weekday
  linkedin: expand(
    [1, 2, 3, 4, 5], // Mon–Fri
    [[8, 0]]          // 8 AM
  ),

  // X: high-frequency, four posts per day every day of the week
  x: expand(
    [0, 1, 2, 3, 4, 5, 6], // every day
    [[9, 0], [13, 0], [17, 0], [20, 0]] // 9 AM, 1 PM, 5 PM, 8 PM
  ),

  // Facebook: two posts per day Mon–Sat
  facebook: expand(
    [1, 2, 3, 4, 5, 6], // Mon–Sat
    [[10, 0], [15, 0]]   // 10 AM, 3 PM
  ),
}

/** How many slots per week each channel's defaults define. */
export const CHANNEL_SLOTS_PER_WEEK: Partial<Record<Channel, number>> = {
  linkedin: 5,   // 1/day × 5 weekdays
  x:        28,  // 4/day × 7 days
  facebook: 12,  // 2/day × 6 days
}

/**
 * How many days of Buffer queue coverage the 10-slot limit provides at the
 * channel's default frequency. This is purely informational for the UI.
 */
export function bufferDaysCoverage(channel: Channel): number {
  const perWeek = CHANNEL_SLOTS_PER_WEEK[channel] ?? 7
  return Math.round((BUFFER_QUEUE_LIMIT / perWeek) * 7)
}

export const CHANNEL_FREQUENCY_LABELS: Partial<Record<Channel, string>> = {
  linkedin: '1× daily · Mon–Fri',
  x:        '4× daily · every day',
  facebook: '2× daily · Mon–Sat',
}

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
