export type Channel = 'linkedin' | 'x' | 'reddit' | 'facebook'
export type PostStatus = 'draft' | 'scheduled' | 'published' | 'archived'
export type ArticleStatus = 'draft' | 'scheduled' | 'published' | 'archived'
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
  // Extended company intel for richer AI context
  company_description: string | null
  products_services: string | null
  value_proposition: string | null
  ideal_customer_profile: string | null
  pain_points: string[]
  competitors: string[]
  geographic_focus: string | null
  company_stage: string | null
  team_size: string | null
  /** Primary languages/frameworks for examples and technical content (e.g. "TypeScript, React") */
  preferred_stack: string | null
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
  type: 'image' | 'video' | 'infographic'
  url: string
  storage_path?: string
  svg?: string
  /** Accessibility alt text for images */
  alt_text?: string
  /** X thread only: zero-based tweet index this asset belongs to */
  tweet_index?: number
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
  buffer_post_id: string | null
  media_items: MediaItem[]
  generation_params: Record<string, unknown>
  ai_generated: boolean
  created_at: string
  updated_at: string
}

export interface ChannelSchedule {
  id: string
  company_id: string
  channel: Channel
  day_of_week: number
  hour: number
  minute: number
  timezone: string
  enabled: boolean
  created_at: string
}

export interface Article {
  id: string
  company_id: string
  title: string
  body: string
  excerpt: string | null
  tags: string[]
  categories: string[]
  slug: string | null
  site_id: string | null
  meta_title: string | null
  meta_description: string | null
  author: string | null
  featured_image_url: string | null
  featured_image_prompt: string | null
  status: ArticleStatus
  scheduled_for: string | null
  published_at: string | null
  ai_generated: boolean
  created_at: string
  updated_at: string
}

export interface BlogSite {
  id: string
  company_id: string
  name: string
  base_url: string
  default_author: string | null
  frontmatter_template: string
  created_at: string
}

export interface ArticleLinkIndexEntry {
  id: string
  company_id: string
  article_id: string
  slug: string
  full_url: string
  title: string
  excerpt: string | null
  tags: string[]
  categories: string[]
  updated_at: string
}

export interface MediaLibraryItem {
  id: string
  company_id: string
  storage_path: string
  url: string
  prompt: string | null
  alt_text: string | null
  type: 'image' | 'infographic'
  svg: string | null
  post_id: string | null
  article_id: string | null
  created_at: string
}

export interface BufferProfile {
  id: string
  service: 'twitter' | 'linkedin' | 'facebook'
  service_username: string
  channel: Channel
}

export interface BufferIntegration {
  id: string
  company_id: string
  access_token: string
  profiles: BufferProfile[]
  connected_at: string
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
