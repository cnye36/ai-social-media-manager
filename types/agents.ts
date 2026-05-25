import type { Channel } from './database'

export type ContentGoal = 'awareness' | 'engagement' | 'promotion' | 'education'
export type PostLength = 'short' | 'medium' | 'long'
export type ArticleFormat = 'blog_post' | 'listicle' | 'deep_dive'

export interface ThreadTweet {
  text: string
  imagePrompt?: string
}

export interface GenerateRequest {
  companyId: string
  channel: Channel
  topic: string
  contentGoal: ContentGoal
  postLength: PostLength
  additionalContext?: string
  threadMode?: boolean
  /** Reddit only: when true, agent fills the disclosure field; when false, omit entirely */
  includeDisclosure?: boolean
}

export interface GeneratedPost {
  content: string
  channel: Channel
  imagePrompt?: string
  contentVariants?: Record<string, unknown>
}
