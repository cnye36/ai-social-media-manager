import type { Channel } from './database'
import type { ContentGoal, PostLength } from './agents'

export type ContentPlanStatus = 'planning' | 'planned' | 'writing' | 'ready' | 'archived'
export type ContentPlanSlotStatus = 'planned' | 'writing' | 'written' | 'skipped'

export interface ContentPillar {
  name: string
  description: string
  frequency: string
  example_topics: string[]
}

export interface ChannelPostingInsight {
  channel: Channel
  best_days: string[]
  best_hours_utc: number[]
  avg_posts_per_week: number
  notes: string
}

export interface ContentPlan {
  id: string
  company_id: string
  name: string
  start_date: string
  end_date: string
  status: ContentPlanStatus
  channels: Channel[]
  additional_context: string | null
  strategy_summary: string | null
  content_pillars: ContentPillar[]
  posting_insights: Record<string, ChannelPostingInsight>
  created_at: string
  updated_at: string
}

export interface ContentPlanSlot {
  id: string
  plan_id: string
  company_id: string
  scheduled_for: string
  channel: Channel
  post_type: string
  pillar: string | null
  topic: string
  content_goal: ContentGoal
  post_length: PostLength
  notes: string | null
  status: ContentPlanSlotStatus
  post_id: string | null
  sort_order: number
  created_at: string
}

export interface ContentPlanWithSlots extends ContentPlan {
  slots: ContentPlanSlot[]
}

export interface CreateContentPlanRequest {
  companyId: string
  name: string
  startDate: string
  endDate: string
  channels: Channel[]
  additionalContext?: string
}
