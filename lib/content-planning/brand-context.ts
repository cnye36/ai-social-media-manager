import type { BrandProfile, Company, Post } from '@/types/database'

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
  ].filter((line): line is string => Boolean(line))

  lines.push(...brandLines)
  return lines.join('\n')
}

export function summarizePastPosts(posts: Post[], limit = 40): string {
  if (posts.length === 0) {
    return 'No scheduled or published posts yet — infer recurring themes from brand profile and company knowledge.'
  }

  return posts.slice(0, limit).map(p => {
    const when = p.scheduled_for ?? p.published_at ?? p.created_at
    const date = when ? new Date(when).toISOString().slice(0, 16) : 'unknown'
    const preview = p.content.replace(/\s+/g, ' ').slice(0, 200)
    return `- [${p.status}] ${p.channel} @ ${date}: ${preview}`
  }).join('\n')
}
