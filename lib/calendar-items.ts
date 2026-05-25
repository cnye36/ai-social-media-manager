import { calendarDisplayAt, isWithinRange } from '@/lib/content-status'
import type { Article, Post } from '@/types/database'

export function filterPostsForCalendar(posts: Post[], rangeStart: Date, rangeEnd: Date): Post[] {
  return posts.filter(p => {
    const at = calendarDisplayAt(p)
    return at !== null && isWithinRange(at, rangeStart, rangeEnd)
  })
}

export function filterArticlesForCalendar(
  articles: Article[],
  rangeStart: Date,
  rangeEnd: Date,
): Article[] {
  return articles.filter(a => {
    const at = calendarDisplayAt(a)
    return at !== null && isWithinRange(at, rangeStart, rangeEnd)
  })
}

export function calendarSortKey(item: Post | Article): string {
  const at = calendarDisplayAt(item)
  return at?.toISOString() ?? ''
}
