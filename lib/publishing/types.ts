import type { Post } from '@/types/database'

export interface PublishResult {
  success: boolean
  platformPostId?: string
  error?: string
}

export type PublishFn = (post: Post) => Promise<PublishResult>
