import type { Post } from '@/types/database'

export interface PublishResult {
  success: boolean
  platformPostId?: string
  /** Buffer-assigned queue slot (`dueAt` from create_post). */
  scheduledFor?: string
  error?: string
}

export type PublishFn = (post: Post) => Promise<PublishResult>
