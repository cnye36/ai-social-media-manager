import type { ContentGoal } from '@/types/agents'

export const CONTENT_GOALS: ContentGoal[] = ['awareness', 'engagement', 'promotion', 'education']

const GOAL_ALIASES: Record<string, ContentGoal> = {
  educational: 'education',
  educate: 'education',
  learning: 'education',
  teach: 'education',
  engaging: 'engagement',
  engage: 'engagement',
  conversation: 'engagement',
  promotional: 'promotion',
  promote: 'promotion',
  sales: 'promotion',
  aware: 'awareness',
  discovery: 'awareness',
}

/** Map API / model output to a valid ContentGoal (defaults to awareness). */
export function normalizeContentGoal(value: unknown, fallback: ContentGoal = 'awareness'): ContentGoal {
  if (typeof value !== 'string') return fallback
  const key = value.trim().toLowerCase()
  if (CONTENT_GOALS.includes(key as ContentGoal)) return key as ContentGoal
  return GOAL_ALIASES[key] ?? fallback
}
