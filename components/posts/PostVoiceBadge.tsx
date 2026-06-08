import { User, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getPostVoice, postVoiceLabel, type PostVoice } from '@/lib/content/post-voice'
import type { Post } from '@/types/database'

interface PostVoiceBadgeProps {
  post: Post
  /** compact: icon only for tight spaces (calendar day cells). default: icon + label */
  size?: 'compact' | 'default'
  className?: string
}

const VOICE_STYLES: Record<PostVoice, { icon: string; badge: string }> = {
  personal: {
    icon: 'text-blue-300',
    badge: 'text-blue-300 bg-blue-500/15 border-blue-500/25',
  },
  company: {
    icon: 'text-violet-300',
    badge: 'text-violet-300 bg-violet-500/15 border-violet-500/25',
  },
}

export function PostVoiceBadge({ post, size = 'default', className }: PostVoiceBadgeProps) {
  const voice = getPostVoice(post)
  if (!voice) return null

  const styles = VOICE_STYLES[voice]
  const Icon = voice === 'personal' ? User : Building2
  const label = postVoiceLabel(voice)

  if (size === 'compact') {
    return (
      <span className="shrink-0" title={`${label} post`} aria-label={`${label} post`}>
        <Icon className={cn('w-2.5 h-2.5', styles.icon, className)} />
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0',
        styles.badge,
        className,
      )}
      title={`${label} post`}
    >
      <Icon className="w-2.5 h-2.5" />
      {label}
    </span>
  )
}
