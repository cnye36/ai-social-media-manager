import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_SCHEDULES, DEFAULT_TIMEZONE } from './defaults'
import type { Channel } from '@/types/database'

export interface ScheduleEntry {
  day_of_week: number
  hour: number
  minute: number
  timezone: string
}

export interface RangedScheduleSlot {
  utc: Date
  calendarDate: string
}

const BUFFER_CHANNELS: Channel[] = ['linkedin', 'x', 'facebook']

/** Convert a local (year, month, day, hour, minute) in a given timezone to a UTC Date. */
function localToUTC(
  year: number, month: number, day: number,
  hour: number, minute: number,
  tz: string
): Date {
  const pad = (n: number) => String(n).padStart(2, '0')
  const isoZ = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00Z`
  const asUTC = new Date(isoZ)
  // Find offset: asUTC represents the same wall-clock time but in UTC
  // toLocaleString converts it to the target tz, giving us the "wrong" local time
  const inTz = new Date(asUTC.toLocaleString('en-US', { timeZone: tz }))
  const offset = asUTC.getTime() - inTz.getTime()
  return new Date(asUTC.getTime() + offset)
}

/** Get local date parts (year, month 1-based, day, dow, hour, minute) for a UTC Date in a timezone. */
function localParts(utcDate: Date, tz: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
    weekday: 'short',
  }).formatToParts(utcDate)

  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  const DOW_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

  return {
    year:      parseInt(get('year')),
    month:     parseInt(get('month')),
    day:       parseInt(get('day')),
    hour:      parseInt(get('hour')),
    minute:    parseInt(get('minute')),
    dayOfWeek: DOW_MAP[get('weekday')] ?? 0,
  }
}

/** Expand schedule entries into concrete UTC timestamps starting after `from`, up to `days` ahead. */
function expandSlots(entries: ScheduleEntry[], from: Date, days = 60): Date[] {
  if (!entries.length) return []
  const tz = entries[0].timezone
  const lp = localParts(from, tz)
  const slots: Date[] = []

  for (let d = 0; d <= days; d++) {
    const candidateBase = new Date(lp.year, lp.month - 1, lp.day + d)
    const dow = candidateBase.getDay()
    const y = candidateBase.getFullYear()
    const m = candidateBase.getMonth() + 1
    const day = candidateBase.getDate()

    for (const entry of entries) {
      if (entry.day_of_week !== dow) continue
      const utc = localToUTC(y, m, day, entry.hour, entry.minute, tz)
      if (utc > from) slots.push(utc)
    }
  }

  return slots.sort((a, b) => a.getTime() - b.getTime())
}

function eachISODate(startDate: string, endDate: string): string[] {
  const dates: string[] = []
  let cur = startDate
  while (cur <= endDate) {
    dates.push(cur)
    const d = new Date(`${cur}T00:00:00.000Z`)
    d.setUTCDate(d.getUTCDate() + 1)
    cur = d.toISOString().slice(0, 10)
  }
  return dates
}

/**
 * Expand schedule entries into concrete UTC timestamps whose local calendar date
 * falls in [startDate, endDate] (inclusive) and is strictly after `after`.
 */
export function listScheduleSlotsInRange(
  entries: ScheduleEntry[],
  startDate: string,
  endDate: string,
  after: Date = new Date(),
): RangedScheduleSlot[] {
  if (!entries.length || endDate < startDate) return []

  const slots: RangedScheduleSlot[] = []
  for (const calendarDate of eachISODate(startDate, endDate)) {
    const [y, m, d] = calendarDate.split('-').map(Number)
    const dow = new Date(`${calendarDate}T00:00:00.000Z`).getUTCDay()

    for (const entry of entries) {
      if (entry.day_of_week !== dow) continue
      const utc = localToUTC(y, m, d, entry.hour, entry.minute, entry.timezone)
      if (utc > after) slots.push({ utc, calendarDate })
    }
  }

  return slots.sort((a, b) => a.utc.getTime() - b.utc.getTime())
}

/** Seed default schedules for a company+channel, returning the entries. */
async function seedDefaults(
  supabase: SupabaseClient,
  companyId: string,
  channel: Channel
): Promise<ScheduleEntry[]> {
  const defs = DEFAULT_SCHEDULES[channel] ?? []
  if (!defs.length) return []

  const rows = defs.map(s => ({
    company_id: companyId,
    channel,
    ...s,
    timezone: DEFAULT_TIMEZONE,
    enabled: true,
  }))

  await supabase
    .from('channel_schedules')
    .upsert(rows, { onConflict: 'company_id,channel,day_of_week,hour,minute' })

  return rows.map(r => ({
    day_of_week: r.day_of_week,
    hour: r.hour,
    minute: r.minute,
    timezone: r.timezone,
  }))
}

/** Load (or seed) enabled schedule entries for a company+channel. */
export async function getChannelSchedules(
  supabase: SupabaseClient,
  companyId: string,
  channel: Channel
): Promise<ScheduleEntry[]> {
  const { data } = await supabase
    .from('channel_schedules')
    .select('day_of_week, hour, minute, timezone')
    .eq('company_id', companyId)
    .eq('channel', channel)
    .eq('enabled', true)

  if (data && data.length > 0) return data as ScheduleEntry[]
  return seedDefaults(supabase, companyId, channel)
}

/**
 * Find the next unoccupied schedule slot for a company+channel after `after`.
 * Returns null if no schedule is configured or all slots within 60 days are taken.
 */
export async function getNextAvailableSlot(
  companyId: string,
  channel: Channel,
  after: Date = new Date()
): Promise<Date | null> {
  if (!BUFFER_CHANNELS.includes(channel)) return null

  const supabase = createAdminClient()
  const entries = await getChannelSchedules(supabase, companyId, channel)
  if (!entries.length) return null

  const candidates = expandSlots(entries, after)
  if (!candidates.length) return null

  // Fetch already-scheduled posts in this window
  const rangeEnd = candidates[candidates.length - 1].toISOString()
  const { data: taken } = await supabase
    .from('posts')
    .select('scheduled_for')
    .eq('company_id', companyId)
    .eq('channel', channel)
    .in('status', ['scheduled'])
    .gte('scheduled_for', after.toISOString())
    .lte('scheduled_for', rangeEnd)

  const takenMinutes = new Set(
    (taken ?? [])
      .map(p => p.scheduled_for)
      .filter(Boolean)
      .map(t => Math.floor(new Date(t!).getTime() / 60_000))
  )

  for (const slot of candidates) {
    const slotMinute = Math.floor(slot.getTime() / 60_000)
    if (!takenMinutes.has(slotMinute)) return slot
  }

  return null
}
