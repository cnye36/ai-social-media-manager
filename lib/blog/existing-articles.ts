import type { SupabaseClient } from '@supabase/supabase-js'

export interface ExistingArticleRow {
  id: string
  title: string
  excerpt: string | null
  body: string
  categories: string[]
  tags: string[]
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
  'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
  'shall', 'can', 'need', 'your', 'you', 'our', 'we', 'they', 'their', 'this', 'that',
  'these', 'those', 'how', 'what', 'why', 'when', 'where', 'who', 'which', 'into', 'about',
])

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w)),
  )
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  for (const w of a) {
    if (b.has(w)) intersection++
  }
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

function setsShareSignificantWord(a: Set<string>, b: Set<string>): boolean {
  for (const w of b) {
    if (w.length >= 4 && a.has(w)) return true
  }
  return false
}

/** True when title, categories, or tags overlap enough to warrant reading the prior body. */
export function isSimilarArticle(article: ExistingArticleRow, newTitle: string): boolean {
  const newTokens = tokenize(newTitle)
  if (newTokens.size === 0) return false

  const titleTokens = tokenize(article.title)
  if (jaccard(newTokens, titleTokens) >= 0.25) return true

  for (const cat of article.categories ?? []) {
    const catTokens = tokenize(cat)
    if (jaccard(newTokens, catTokens) >= 0.4) return true
    if (setsShareSignificantWord(newTokens, catTokens)) return true
  }

  for (const tag of article.tags ?? []) {
    const tagTokens = tokenize(tag)
    if (setsShareSignificantWord(newTokens, tagTokens)) return true
  }

  return false
}

function stripMarkdownForSummary(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#*`_>[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function articleSummary(article: ExistingArticleRow, maxLen = 160): string {
  if (article.excerpt?.trim()) return article.excerpt.trim()
  const plain = stripMarkdownForSummary(article.body)
  if (!plain) return ''
  return plain.length > maxLen ? `${plain.slice(0, maxLen)}…` : plain
}

export async function fetchExistingArticles(
  supabase: SupabaseClient,
  companyId: string,
  limit = 50,
): Promise<ExistingArticleRow[]> {
  const { data } = await supabase
    .from('articles')
    .select('id, title, excerpt, body, categories, tags')
    .eq('company_id', companyId)
    .not('title', 'is', null)
    .neq('title', '')
    .order('updated_at', { ascending: false })
    .limit(limit)

  return (data ?? []).map(row => ({
    id: row.id,
    title: row.title,
    excerpt: row.excerpt,
    body: row.body ?? '',
    categories: row.categories ?? [],
    tags: row.tags ?? [],
  }))
}

/** Compact list for idea generation — titles plus short summaries. */
export function buildIdeasDedupContext(articles: ExistingArticleRow[]): string {
  if (articles.length === 0) return ''

  const lines = articles.map(a => {
    const summary = articleSummary(a)
    const meta = [
      a.categories.length ? `categories: ${a.categories.join(', ')}` : null,
      a.tags.length ? `tags: ${a.tags.slice(0, 5).join(', ')}` : null,
    ].filter(Boolean).join('; ')
    const suffix = summary ? ` — ${summary}` : ''
    const metaSuffix = meta ? ` (${meta})` : ''
    return `- "${a.title}"${metaSuffix}${suffix}`
  })

  return `EXISTING ARTICLES (do NOT suggest duplicate topics, angles, or close title variants):
${lines.join('\n')}`
}

function truncateBody(body: string, maxChars: number): string {
  const stripped = body.replace(/<!--[\s\S]*?-->/g, '').trim()
  if (stripped.length <= maxChars) return stripped
  return `${stripped.slice(0, maxChars)}…`
}

export interface WritingDedupContext {
  titlesContext: string
  similarBodiesContext: string
}

/** Titles for all articles; full body excerpts only for category/title-similar posts. */
export function buildWritingDedupContext(
  articles: ExistingArticleRow[],
  newTitle: string,
  options?: { maxSimilarBodies?: number; bodyTruncateChars?: number },
): WritingDedupContext {
  const maxSimilarBodies = options?.maxSimilarBodies ?? 5
  const bodyTruncateChars = options?.bodyTruncateChars ?? 2500

  if (articles.length === 0) {
    return { titlesContext: '', similarBodiesContext: '' }
  }

  const titleLines = articles.map(a => {
    const meta = [
      a.categories.length ? `categories: ${a.categories.join(', ')}` : null,
      a.tags.length ? `tags: ${a.tags.slice(0, 4).join(', ')}` : null,
    ].filter(Boolean).join('; ')
    const summary = articleSummary(a, 100)
    const parts = [`- "${a.title}"`]
    if (meta) parts.push(`(${meta})`)
    if (summary) parts.push(`— ${summary}`)
    return parts.join(' ')
  })

  const titlesContext = `PREVIOUSLY WRITTEN ARTICLES (your new piece must be clearly distinct):
${titleLines.join('\n')}`

  const similar = articles
    .filter(a => isSimilarArticle(a, newTitle))
    .slice(0, maxSimilarBodies)

  if (similar.length === 0) {
    return { titlesContext, similarBodiesContext: '' }
  }

  const bodyBlocks = similar.map(a => {
    const meta = a.categories.length ? `Categories: ${a.categories.join(', ')}` : ''
    const body = truncateBody(a.body, bodyTruncateChars)
    const excerpt = a.excerpt?.trim()
    return `### "${a.title}"
${meta}
${excerpt ? `Excerpt: ${excerpt}\n` : ''}Prior article body (study to avoid repeating the same arguments, examples, structure, and phrasing):
${body || '(empty draft)'}`
  })

  const similarBodiesContext = `SIMILAR EXISTING ARTICLES (same topic area or category — do NOT rewrite these; find a fresh angle, new examples, and different section structure):
${bodyBlocks.join('\n\n')}`

  return { titlesContext, similarBodiesContext }
}
