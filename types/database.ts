export type Channel = 'linkedin' | 'x' | 'reddit' | 'facebook'
export type PostStatus = 'draft' | 'scheduled' | 'published' | 'archived'
export type SourceType = 'website' | 'manual'
export type ScrapeStatus = 'pending' | 'running' | 'done' | 'error'

export interface Company {
  id: string
  owner_id: string
  name: string
  slug: string
  website_url: string | null
  logo_url: string | null
  created_at: string
}

export interface BrandProfile {
  id: string
  company_id: string
  tone: string
  voice_notes: string | null
  target_audience: string | null
  keywords: string[]
  avoid_phrases: string[]
  color_palette: Record<string, string>
  channel_overrides: Partial<Record<Channel, { tone?: string; voice_notes?: string }>>
  updated_at: string
}

export interface KnowledgeChunk {
  id: string
  company_id: string
  source_type: SourceType
  source_url: string | null
  title: string | null
  content: string
  metadata: Record<string, unknown>
  created_at: string
}

export interface MediaItem {
  type: 'image' | 'video'
  url: string
  storage_path?: string
}

export interface Post {
  id: string
  company_id: string
  channel: Channel
  status: PostStatus
  content: string
  content_variants: Record<string, unknown>
  scheduled_for: string | null
  published_at: string | null
  media_items: MediaItem[]
  generation_params: Record<string, unknown>
  ai_generated: boolean
  created_at: string
  updated_at: string
}

export interface ScrapeJob {
  id: string
  company_id: string
  url: string
  status: ScrapeStatus
  pages_scraped: number
  error_message: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}
