import type { Channel, Post } from '@/types/database'
import type { ChannelPostingInsight } from '@/types/content-planning'
import { CHANNEL_PLAYBOOKS } from './channel-playbook'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function topValues(counts: Map<number, number>, n: number): number[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([value]) => value)
}

export function analyzePostingInsights(
  posts: Post[],
  channels: Channel[],
): Record<string, ChannelPostingInsight> {
  const insights: Record<string, ChannelPostingInsight> = {}

  for (const channel of channels) {
    const channelPosts = posts.filter(p => p.channel === channel)
    const hourCounts = new Map<number, number>()
    const dayCounts = new Map<number, number>()

    for (const post of channelPosts) {
      const when = post.scheduled_for ?? post.published_at
      if (!when) continue
      const d = new Date(when)
      hourCounts.set(d.getUTCHours(), (hourCounts.get(d.getUTCHours()) ?? 0) + 1)
      dayCounts.set(d.getUTCDay(), (dayCounts.get(d.getUTCDay()) ?? 0) + 1)
    }

    const bestHours = channelPosts.length > 0
      ? topValues(hourCounts, 3)
      : defaultBestHours(channel)

    const bestDays = channelPosts.length > 0
      ? topValues(dayCounts, 3).map(d => DAY_NAMES[d])
      : defaultBestDays(channel)

    const oldest = channelPosts.length
      ? Math.min(...channelPosts.map(p =>
          new Date(p.scheduled_for ?? p.published_at ?? p.created_at).getTime()
        ))
      : Date.now()
    const weeks = Math.max(1, Math.ceil((Date.now() - oldest) / (7 * 24 * 60 * 60 * 1000)))

    insights[channel] = {
      channel,
      best_days: bestDays,
      best_hours_utc: bestHours.length ? bestHours : defaultBestHours(channel),
      avg_posts_per_week: channelPosts.length / weeks,
      notes: channelPosts.length === 0
        ? 'No historical data — using industry defaults for this channel.'
        : `Based on ${channelPosts.length} scheduled/published posts.`,
    }
  }

  return insights
}

function defaultBestHours(channel: Channel): number[] {
  return CHANNEL_PLAYBOOKS[channel].bestHoursUtc
}

function defaultBestDays(channel: Channel): string[] {
  return CHANNEL_PLAYBOOKS[channel].bestDays
}
