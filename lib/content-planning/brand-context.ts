import type { BrandProfile, Company, Post, Channel } from '@/types/database'
import { extractOpeningLine } from '@/lib/content/recent-posts'

/** One-line instruction for agents when a preferred stack is configured. */
export function preferredStackGuidance(brand: BrandProfile | null): string | null {
  const stack = brand?.preferred_stack?.trim()
  if (!stack) return null
  return (
    `Preferred tech stack: ${stack}. ` +
    'When giving examples, tooling suggestions, architecture advice, or code-related ideas, default to this stack unless the topic clearly requires something else.'
  )
}

export function buildBrandContext(company: Company, brand: BrandProfile | null): string {
  const lines: string[] = [`Company: ${company.name}`]
  if (company.website_url) lines.push(`Website: ${company.website_url}`)

  if (!brand) {
    lines.push('No brand profile configured yet.')
    return lines.join('\n')
  }

  const brandLines = [
    `Tone: ${brand.tone}`,
    brand.voice_notes ? `Voice: ${brand.voice_notes}` : null,
    brand.target_audience ? `Audience: ${brand.target_audience}` : null,
    brand.company_description ? `Description: ${brand.company_description}` : null,
    brand.products_services ? `Products/services: ${brand.products_services}` : null,
    brand.value_proposition ? `Value proposition: ${brand.value_proposition}` : null,
    brand.ideal_customer_profile ? `Ideal customer: ${brand.ideal_customer_profile}` : null,
    brand.pain_points?.length ? `Pain points solved: ${brand.pain_points.join('; ')}` : null,
    brand.competitors?.length ? `Competitors: ${brand.competitors.join(', ')}` : null,
    brand.geographic_focus ? `Geography: ${brand.geographic_focus}` : null,
    brand.company_stage ? `Stage: ${brand.company_stage}` : null,
    brand.keywords?.length ? `Keywords: ${brand.keywords.join(', ')}` : null,
    brand.avoid_phrases?.length ? `Avoid: ${brand.avoid_phrases.join(', ')}` : null,
    preferredStackGuidance(brand),
  ].filter((line): line is string => Boolean(line))

  lines.push(...brandLines)
  return lines.join('\n')
}

export function summarizePastPosts(posts: Post[], limit = 40): string {
  if (posts.length === 0) {
    return 'No scheduled or published posts yet — infer recurring themes from brand profile and company knowledge.'
  }

  const sliced = posts.slice(0, limit)
  const byChannel = new Map<Channel, Post[]>()

  for (const post of sliced) {
    const list = byChannel.get(post.channel) ?? []
    list.push(post)
    byChannel.set(post.channel, list)
  }

  const channelSections = [...byChannel.entries()].map(([channel, channelPosts]) => {
    const lines = channelPosts.slice(0, 5).map(p => {
      const when = p.scheduled_for ?? p.published_at ?? p.created_at
      const date = when ? new Date(when).toISOString().slice(0, 10) : 'unknown'
      const opener = extractOpeningLine(p.content)
      return `  - [${p.status}] ${date}: opens with "${opener.slice(0, 80)}${opener.length > 80 ? '…' : ''}"`
    })
    return `${channel.toUpperCase()} (do not plan topics that would repeat these openers back-to-back):\n${lines.join('\n')}`
  })

  return [
    'Recent posts grouped by channel — vary hooks and angles so planned slots do not clone these:',
    channelSections.join('\n\n'),
  ].join('\n\n')
}
