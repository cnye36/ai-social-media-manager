import { tool } from '@openai/agents'
import { z } from 'zod'
import type { Channel } from '@/types/database'
import { CHANNEL_SKILLS } from '@/lib/content/skills'

export function buildLoadSkillTool(channel: Channel) {
  return tool({
    name: 'load_writing_skill',
    description: `Load your specialized ${channel} writing skill — mechanical techniques for beating AI-content detectors (burstiness, perplexity, structural predictability) plus ${channel}-specific craft. Call this once, before drafting, and apply everything in it.`,
    parameters: z.object({}),
    execute: async () => CHANNEL_SKILLS[channel],
  })
}

export function buildBlogLoadSkillTool() {
  return tool({
    name: 'load_writing_skill',
    description: 'Load your specialized long-form blog writing skill — mechanical techniques for beating AI-content detectors (burstiness, perplexity, structural predictability) plus long-form craft. Call this once, before drafting, and apply everything in it.',
    parameters: z.object({}),
    execute: async () => {
      const { BLOG_SKILL } = await import('@/lib/content/skills')
      return BLOG_SKILL
    },
  })
}
