import type { Channel, Post } from '@/types/database'

export type PostVoice = 'personal' | 'company'

export const CHANNEL_VOICE_KEYS: Record<Channel, string> = {
  linkedin: 'linkedin_voice',
  x: 'x_voice',
  facebook: 'facebook_voice',
  reddit: 'reddit_voice',
}

const COMPANY_VOICE: Record<Channel, string> = {
  linkedin:
    'VOICE: Write as a company LinkedIn post. Use "we" and "our" language. Focus on brand, products, client outcomes, and business perspective. Speak as the company, not as an individual.',
  x:
    'VOICE: Write as a company X post. Use "we" and "our" language. Keep it brand-appropriate but still sharp and direct — not corporate or generic. Speak as the business.',
  facebook:
    'VOICE: Write as a company Facebook post. Use "we/our" brand voice while staying warm and community-focused.',
  reddit:
    'VOICE: Write as someone from the company sharing useful experience. Use "we/our" where natural. Not a personal-brand or diary post.',
}

const PERSONAL_VOICE: Record<Channel, string> = {
  linkedin:
    'VOICE: Write as a personal LinkedIn post from an individual founder/expert. Use first-person "I" throughout. Be authentic, conversational, and story-driven. Write from the human perspective, not from a company.',
  x:
    'VOICE: Write as a personal X post from an individual founder/creator. Use first-person "I" and opinionated language. Be direct, punchy, and authentic. This is the human behind the account, not a brand.',
  facebook:
    'VOICE: Write as a personal Facebook post from an individual. Use first-person "I" throughout. Be warm, relatable, and conversational.',
  reddit:
    'VOICE: Write in first-person "I" as an individual community member sharing experience.',
}

export function getPostVoice(post: Post): PostVoice | null {
  const key = CHANNEL_VOICE_KEYS[post.channel]
  const value = post.generation_params?.[key]
  return value === 'personal' || value === 'company' ? value : null
}

export function postVoiceLabel(voice: PostVoice): string {
  return voice === 'personal' ? 'Personal' : 'Company'
}

export function parsePlanVoice(value: unknown, additionalContext?: string | null): PostVoice {
  if (value === 'personal' || value === 'company') return value
  const m = additionalContext?.match(/^\[\[voice:(personal|company)\]\]/)
  return m?.[1] === 'personal' ? 'personal' : 'company'
}

export function stripVoicePrefix(context: string | null | undefined): string | null {
  if (!context) return null
  const stripped = context.replace(/^\[\[voice:(personal|company)\]\]\n?/, '').trim()
  return stripped || null
}

export function voiceInstruction(channel: Channel, voice: PostVoice): string {
  return voice === 'personal' ? PERSONAL_VOICE[channel] : COMPANY_VOICE[channel]
}
