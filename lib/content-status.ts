import type { ArticleStatus, PostStatus } from '@/types/database'

export type ContentStatus = PostStatus | ArticleStatus

export function datetimeFieldLabel(status: ContentStatus): string {
  return status === 'published' ? 'Published on' : 'Schedule for'
}

export function initialDatetimeLocal(
  status: ContentStatus,
  scheduledFor: string | null,
  publishedAt: string | null,
): string {
  if (status === 'published' && publishedAt) return toDatetimeLocal(publishedAt)
  if (scheduledFor) return toDatetimeLocal(scheduledFor)
  return ''
}

export function toDatetimeLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Maps UI status + datetime input to API fields. */
export function buildStatusDatetimePayload(
  status: ContentStatus,
  datetimeLocal: string,
): { status: ContentStatus; scheduled_for: string | null; published_at?: string } {
  const iso = datetimeLocal ? new Date(datetimeLocal).toISOString() : null

  if (status === 'published') {
    return {
      status,
      scheduled_for: null,
      published_at: iso ?? new Date().toISOString(),
    }
  }

  if (status === 'scheduled') {
    return { status, scheduled_for: iso }
  }

  return { status, scheduled_for: null }
}

/** Date used on the content calendar (published → published_at, scheduled → scheduled_for). */
export function calendarDisplayAt(item: {
  status: string
  scheduled_for: string | null
  published_at: string | null
}): Date | null {
  if (item.status === 'published') {
    if (item.published_at) return new Date(item.published_at)
    if (item.scheduled_for) return new Date(item.scheduled_for)
    return null
  }
  if (item.status === 'scheduled' && item.scheduled_for) {
    return new Date(item.scheduled_for)
  }
  return null
}

export function isWithinRange(at: Date, rangeStart: Date, rangeEnd: Date): boolean {
  return at.getTime() >= rangeStart.getTime() && at.getTime() <= rangeEnd.getTime()
}

export function onStatusSelect(
  next: ContentStatus,
  currentDatetime: string,
): { status: ContentStatus; datetime: string } {
  if (next === 'published') {
    return { status: next, datetime: currentDatetime }
  }
  if (next === 'scheduled') {
    return {
      status: next,
      datetime: currentDatetime || toDatetimeLocal(new Date().toISOString()),
    }
  }
  if (next === 'draft' || next === 'archived') {
    return { status: next, datetime: '' }
  }
  return { status: next, datetime: currentDatetime }
}

/** Datetime edits never change status — user picks status explicitly. */
export function onDatetimeChange(value: string): string {
  return value
}

export function syncDatetimeFieldsFromSaved(item: {
  status: ContentStatus
  scheduled_for: string | null
  published_at: string | null
}): string {
  return initialDatetimeLocal(item.status, item.scheduled_for, item.published_at)
}
