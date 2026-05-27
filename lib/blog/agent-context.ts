import type { SupabaseClient } from '@supabase/supabase-js'
import { buildArticlePublicUrl } from '@/lib/blog/article-url'
import {
  buildLegacyInternalLinksContext,
  buildLegacyPublishedArticlesContext,
  companyUsesLegacyCatalog,
  legacyEntriesToArticleRows,
  loadLegacyBlogCatalog,
  mergeInternalLinksContext,
  resolveBlogBaseUrl,
} from '@/lib/blog/legacy-catalog'
import {
  buildIdeasDedupContext,
  buildWritingDedupContext,
  fetchExistingArticles,
  type ExistingArticleRow,
} from '@/lib/blog/existing-articles'

interface LinkIndexRow {
  full_url: string
  title: string
  excerpt: string | null
  slug?: string
}

export async function fetchBlogAgentContext(
  supabase: SupabaseClient,
  companyId: string,
  company: { name?: string | null; website_url?: string | null },
  newTitle?: string,
) {
  const [{ data: linkIndex }, appArticles] = await Promise.all([
    supabase
      .from('article_link_index')
      .select('full_url, title, excerpt, slug')
      .eq('company_id', companyId)
      .order('updated_at', { ascending: false })
      .limit(40),
    fetchExistingArticles(supabase, companyId, 50),
  ])

  const useLegacy = companyUsesLegacyCatalog(company)
  const legacyEntries = useLegacy ? loadLegacyBlogCatalog() : []
  const blogBaseUrl = await resolveBlogBaseUrl(supabase, companyId, company.website_url)

  const dbLinkLines =
    linkIndex?.map(l => {
      const url =
        l.slug && blogBaseUrl
          ? buildArticlePublicUrl(blogBaseUrl, l.slug)
          : l.full_url
      return `- [${l.title}](${url})${l.excerpt ? ` — ${l.excerpt}` : ''}`
    }) ?? []

  const legacyLinksContext = useLegacy
    ? buildLegacyInternalLinksContext(legacyEntries, blogBaseUrl)
    : ''

  const internalLinksContext = mergeInternalLinksContext(dbLinkLines, legacyLinksContext)

  const legacyRows = useLegacy ? legacyEntriesToArticleRows(legacyEntries) : []
  const mergedArticles = mergeArticleLists(appArticles, legacyRows)

  const legacyPublishedContext = useLegacy
    ? buildLegacyPublishedArticlesContext(legacyEntries)
    : ''

  const writingContext = newTitle
    ? buildWritingDedupContext(mergedArticles, newTitle)
    : { titlesContext: '', similarBodiesContext: '' }

  const ideasContext = buildIdeasDedupContext(mergedArticles)

  return {
    internalLinksContext,
    legacyPublishedContext,
    writingContext,
    ideasContext,
    blogBaseUrl,
  }
}

function mergeArticleLists(
  appArticles: ExistingArticleRow[],
  legacyRows: ExistingArticleRow[],
): ExistingArticleRow[] {
  const appSlugs = new Set(
    appArticles.map(a => a.title.toLowerCase()),
  )
  const legacyOnly = legacyRows.filter(l => !appSlugs.has(l.title.toLowerCase()))
  return [...appArticles, ...legacyOnly]
}
