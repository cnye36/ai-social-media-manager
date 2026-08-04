import type { Channel } from '@/types/database'
import { LINKEDIN_SKILL } from './linkedin-skill'
import { X_SKILL } from './x-skill'
import { REDDIT_SKILL } from './reddit-skill'
import { FACEBOOK_SKILL } from './facebook-skill'

export const CHANNEL_SKILLS: Record<Channel, string> = {
  linkedin: LINKEDIN_SKILL,
  x: X_SKILL,
  reddit: REDDIT_SKILL,
  facebook: FACEBOOK_SKILL,
}

export { BLOG_SKILL } from './blog-skill'
