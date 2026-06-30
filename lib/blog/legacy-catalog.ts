import { readFileSync } from 'fs'
import { join } from 'path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildArticlePublicUrl, DEFAULT_BLOG_BASE_URL, normalizeBlogBaseUrl } from '@/lib/blog/article-url'
import type { ExistingArticleRow } from '@/lib/blog/existing-articles'

export interface LegacyBlogEntry {
  slug: string
  publishedAt: string
  title: string
  summary: string
}

const CATALOG_FILES: Record<string, string> = {
  'ai-automatedhq': 'ai-automatedhq-blog-internal-links.md',
  'affinitybots': 'affinitybots-blog-internal-links.md',
}

const catalogCache = new Map<string, LegacyBlogEntry[]>()

function catalogPath(filename: string): string {
  return join(process.cwd(), 'lib', 'blog', 'data', filename)
}

export function getCatalogFilenameForCompany(company: {
  name?: string | null
  website_url?: string | null
}): string | null {
  const website = company.website_url?.toLowerCase() ?? ''
  const name = company.name?.toLowerCase() ?? ''

  for (const [key, filename] of Object.entries(CATALOG_FILES)) {
    if (website.includes(key) || name.includes(key)) return filename
  }
  return null
}

/** Parse the legacy blog catalog markdown (## slug sections with Date, Title, Summary). */
export function parseLegacyBlogCatalog(markdown: string): LegacyBlogEntry[] {
  const entries: LegacyBlogEntry[] = []
  const sections = markdown.split(/\n(?=## )/)

  for (const section of sections) {
    const headerMatch = section.match(/^## ([a-z0-9][a-z0-9-]*)\s*$/m)
    if (!headerMatch) continue

    const slug = headerMatch[1]
    const dateMatch = section.match(/\*\*Date:\*\*\s*(\d{4}-\d{2}-\d{2})/)
    const titleMatch = section.match(/\*\*Title:\*\*\s*(.+)/)
    const summaryMatch = section.match(/\*\*Summary:\*\*\s*([\s\S]+?)(?=\n---|\n## |\n\*\*|$)/)

    if (!dateMatch || !titleMatch || !summaryMatch) continue

    entries.push({
      slug,
      publishedAt: dateMatch[1],
      title: titleMatch[1].trim(),
      summary: summaryMatch[1].replace(/\s+/g, ' ').trim(),
    })
  }

  return entries
}

export function loadLegacyBlogCatalog(filename?: string): LegacyBlogEntry[] {
  const file = filename ?? CATALOG_FILES['ai-automatedhq']
  if (catalogCache.has(file)) return catalogCache.get(file)!
  try {
    const markdown = readFileSync(catalogPath(file), 'utf8')
    const entries = parseLegacyBlogCatalog(markdown)
    catalogCache.set(file, entries)
    return entries
  } catch {
    catalogCache.set(file, [])
    return []
  }
}

export function companyUsesLegacyCatalog(company: {
  name?: string | null
  website_url?: string | null
}): boolean {
  return getCatalogFilenameForCompany(company) !== null
}

export function legacyEntriesToArticleRows(entries: LegacyBlogEntry[]): ExistingArticleRow[] {
  return entries.map(e => ({
    id: `legacy:${e.slug}`,
    title: e.title,
    excerpt: e.summary,
    body: '',
    categories: [] as string[],
    tags: ['legacy-import'] as string[],
  }))
}

export interface LegacyLinkRow {
  slug: string
  full_url: string
  title: string
  excerpt: string | null
  publishedAt: string
}

export function legacyEntriesToLinkRows(
  entries: LegacyBlogEntry[],
  baseUrl: string,
): LegacyLinkRow[] {
  const base = baseUrl.trim() || DEFAULT_BLOG_BASE_URL
  return entries.map(e => ({
    slug: e.slug,
    full_url: buildArticlePublicUrl(base, e.slug),
    title: e.title,
    excerpt: e.summary,
    publishedAt: e.publishedAt,
  }))
}

export function buildLegacyInternalLinksContext(
  entries: LegacyBlogEntry[],
  baseUrl: string,
): string {
  const rows = legacyEntriesToLinkRows(entries, baseUrl)
  if (rows.length === 0) return ''

  const lines = rows.map(
    l =>
      `- [${l.title}](${l.full_url}) (published ${l.publishedAt})${l.excerpt ? ` — ${l.excerpt}` : ''}`,
  )

  return `LEGACY PUBLISHED ARTICLES (live on the website — use these exact URLs for internal links; every path includes /blog/):
${lines.join('\n')}`
}

export function buildLegacyPublishedArticlesContext(entries: LegacyBlogEntry[]): string {
  if (entries.length === 0) return ''

  const lines = entries.map(
    e => `- "${e.title}" (published ${e.publishedAt}) — ${e.summary}`,
  )

  return `WEBSITE PUBLISH HISTORY (articles already live — avoid duplicate topics; prefer linking to these when relevant):
${lines.join('\n')}`
}

export async function resolveBlogBaseUrl(
  supabase: SupabaseClient,
  companyId: string,
  websiteUrl?: string | null,
): Promise<string> {
  const { data: sites } = await supabase
    .from('blog_sites')
    .select('base_url')
    .eq('company_id', companyId)
    .order('created_at', { ascending: true })
    .limit(1)

  const raw = sites?.[0]?.base_url ?? websiteUrl?.trim() ?? DEFAULT_BLOG_BASE_URL
  return normalizeBlogBaseUrl(raw)
}

/** Merge DB link index rows with legacy catalog; DB wins on slug conflicts. */
export function mergeInternalLinksContext(
  dbLines: string[],
  legacyContext: string,
): string {
  const parts = [...dbLines]
  if (legacyContext.trim()) parts.push(legacyContext.trim())
  return parts.join('\n\n')
}
