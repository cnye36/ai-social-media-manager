import type { Channel, Post } from '@/types/database'

export type PostVoice = 'personal' | 'company'

const CHANNEL_VOICE_KEYS: Record<Channel, string> = {
  linkedin: 'linkedin_voice',
  x: 'x_voice',
  facebook: 'facebook_voice',
  reddit: 'reddit_voice',
}

export function getPostVoice(post: Post): PostVoice | null {
  const key = CHANNEL_VOICE_KEYS[post.channel]
  const value = post.generation_params?.[key]
  return value === 'personal' || value === 'company' ? value : null
}

export function postVoiceLabel(voice: PostVoice): string {
  return voice === 'personal' ? 'Personal' : 'Business'
}
