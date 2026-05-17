import type { Channel } from './database'

export type ContentGoal = 'awareness' | 'engagement' | 'promotion' | 'education'
export type PostLength = 'short' | 'medium' | 'long'

export interface GenerateRequest {
  companyId: string
  channel: Channel
  topic: string
  contentGoal: ContentGoal
  postLength: PostLength
  additionalContext?: string
}

export interface GeneratedPost {
  content: string
  channel: Channel
  imagePrompt?: string
  contentVariants?: Record<string, unknown>
}
