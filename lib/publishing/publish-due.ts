import type { SupabaseClient } from '@supabase/supabase-js'
import { publish } from '@/lib/publishing'
import type { Article, Post } from '@/types/database'

export interface PublishDueResult {
  postsPublished: number
  articlesPublished: number
  failed: number
}

/**
 * Marks overdue scheduled posts/articles as published.
 * Posts also run through channel publish adapters when configured.
 */
export async function publishDueContent(
  supabase: SupabaseClient,
  options?: { companyId?: string; limit?: number },
): Promise<PublishDueResult> {
  const now = new Date().toISOString()
  const limit = options?.limit ?? 50

  let postsQuery = supabase
    .from('posts')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_for', now)
    .limit(limit)

  if (options?.companyId) {
    postsQuery = postsQuery.eq('company_id', options.companyId)
  }

  let articlesQuery = supabase
    .from('articles')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_for', now)
    .limit(limit)

  if (options?.companyId) {
    articlesQuery = articlesQuery.eq('company_id', options.companyId)
  }

  const [{ data: duePosts, error: postsError }, { data: dueArticles, error: articlesError }] =
    await Promise.all([postsQuery, articlesQuery])

  if (postsError) throw new Error(postsError.message)
  if (articlesError) throw new Error(articlesError.message)

  const publishedAt = now
  let failed = 0

  const postResults = await Promise.allSettled(
    (duePosts as Post[] | null ?? []).map(async post => {
      // Posts already pushed to Buffer don't need a direct publish call —
      // Buffer will post them automatically. Just mark done and clear the slot.
      if (!post.buffer_post_id) {
        await publish(post)
      }
      const { error } = await supabase
        .from('posts')
        .update({ status: 'published', published_at: publishedAt, scheduled_for: null, buffer_post_id: null })
        .eq('id', post.id)
      if (error) throw new Error(error.message)
    }),
  )

  failed += postResults.filter(r => r.status === 'rejected').length
  const postsPublished = postResults.filter(r => r.status === 'fulfilled').length

  const articleResults = await Promise.allSettled(
    (dueArticles as Article[] | null ?? []).map(async article => {
      const { error } = await supabase
        .from('articles')
        .update({ status: 'published', published_at: publishedAt, scheduled_for: null })
        .eq('id', article.id)
      if (error) throw new Error(error.message)
    }),
  )

  failed += articleResults.filter(r => r.status === 'rejected').length
  const articlesPublished = articleResults.filter(r => r.status === 'fulfilled').length

  return { postsPublished, articlesPublished, failed }
}
