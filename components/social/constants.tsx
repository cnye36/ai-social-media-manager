import { Pencil, CalendarClock, CircleCheck, Clock } from 'lucide-react'
import type { ContentGoal, PostLength } from '@/types/agents'
import type { PostStatus } from '@/types/database'
import type { ChannelConfig, ChannelVoice } from '@/lib/social/channel-config'

export function buildGoals(config: ChannelConfig): { id: ContentGoal; label: string; description: string }[] {
  return [
    { id: 'awareness', label: 'Awareness', description: 'Introduce & attract new audiences' },
    { id: 'engagement', label: 'Engagement', description: config.engagementDescription },
    { id: 'promotion', label: 'Promotion', description: 'Drive action toward a product' },
    { id: 'education', label: 'Education', description: 'Teach something valuable' },
  ]
}

export const LENGTHS: { id: PostLength; label: string }[] = [
  { id: 'short', label: 'Short' },
  { id: 'medium', label: 'Medium' },
  { id: 'long', label: 'Long' },
]

export const STATUS_STYLES: Record<PostStatus, string> = {
  draft: 'text-zinc-400 bg-zinc-800',
  scheduled: 'text-yellow-400 bg-yellow-900/30',
  published: 'text-emerald-400 bg-emerald-900/30',
  archived: 'text-zinc-600 bg-zinc-900',
}

export const STATUS_ICONS: Record<PostStatus, React.ReactNode> = {
  draft: <Pencil className="w-3 h-3" />,
  scheduled: <CalendarClock className="w-3 h-3" />,
  published: <CircleCheck className="w-3 h-3" />,
  archived: <Clock className="w-3 h-3" />,
}

export function buildAdditionalContext(config: ChannelConfig, voice: ChannelVoice, userContext: string): string {
  const voiceInstruction = config.copy.voiceInstruction[voice]
  return userContext.trim() ? `${voiceInstruction}\n\n${userContext}` : voiceInstruction
}
