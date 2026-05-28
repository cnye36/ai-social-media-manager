import type { Article } from '@/types/database'

/** Best date for list ordering: publish → schedule → last update → created. */
export function articleListSortTime(article: Article): number {
  if (article.status === 'published' && article.published_at) {
    return new Date(article.published_at).getTime()
  }
  if (article.status === 'scheduled' && article.scheduled_for) {
    return new Date(article.scheduled_for).getTime()
  }
  return new Date(article.updated_at ?? article.created_at).getTime()
}

export function sortArticlesNewestFirst(articles: Article[]): Article[] {
  return [...articles].sort((a, b) => articleListSortTime(b) - articleListSortTime(a))
}
