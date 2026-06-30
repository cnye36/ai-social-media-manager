import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildArticlePublicUrl } from '@/lib/blog/article-url'
import {
  companyUsesLegacyCatalog,
  getCatalogFilenameForCompany,
  legacyEntriesToLinkRows,
  loadLegacyBlogCatalog,
  resolveBlogBaseUrl,
} from '@/lib/blog/legacy-catalog'

const LEGACY_TAG = 'legacy-import'

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { companyId } = body as { companyId?: string }
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

  const { data: company } = await supabase
    .from('companies')
    .select('id, name, website_url')
    .eq('id', companyId)
    .eq('owner_id', user.id)
    .single()
  if (!company) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!companyUsesLegacyCatalog(company)) {
    return NextResponse.json(
      { error: 'No legacy blog catalog configured for this company' },
      { status: 400 },
    )
  }

  const catalogFilename = getCatalogFilenameForCompany(company) ?? undefined
  const entries = loadLegacyBlogCatalog(catalogFilename)
  if (entries.length === 0) {
    return NextResponse.json({ error: 'Legacy catalog file is empty or missing' }, { status: 500 })
  }

  const blogBaseUrl = await resolveBlogBaseUrl(supabase, companyId, company.website_url)
  const linkRows = legacyEntriesToLinkRows(entries, blogBaseUrl)

  const { data: sites } = await supabase
    .from('blog_sites')
    .select('id')
    .eq('company_id', companyId)
    .order('created_at', { ascending: true })
    .limit(1)
  const siteId = sites?.[0]?.id ?? null

  const { data: existing } = await supabase
    .from('articles')
    .select('id, slug')
    .eq('company_id', companyId)
    .not('slug', 'is', null)

  const slugToArticleId = new Map((existing ?? []).map(a => [a.slug as string, a.id]))

  let created = 0
  let updated = 0
  let linkIndexUpserts = 0

  for (const entry of entries) {
    const publishedAt = new Date(`${entry.publishedAt}T12:00:00.000Z`).toISOString()
    const fullUrl = buildArticlePublicUrl(blogBaseUrl, entry.slug)
    let articleId = slugToArticleId.get(entry.slug)

    if (!articleId) {
      const { data: inserted, error } = await supabase
        .from('articles')
        .insert({
          company_id: companyId,
          site_id: siteId,
          title: entry.title,
          body: '',
          excerpt: entry.summary,
          slug: entry.slug,
          tags: [LEGACY_TAG],
          status: 'published',
          published_at: publishedAt,
          ai_generated: false,
        })
        .select('id')
        .single()

      if (error) {
        console.error('Legacy import insert failed:', entry.slug, error.message)
        continue
      }
      articleId = inserted.id
      slugToArticleId.set(entry.slug, articleId)
      created++
    } else {
      const { error } = await supabase
        .from('articles')
        .update({
          title: entry.title,
          excerpt: entry.summary,
          status: 'published',
          published_at: publishedAt,
          site_id: siteId,
        })
        .eq('id', articleId)

      if (!error) updated++
    }

    const { error: linkError } = await supabase.from('article_link_index').upsert(
      {
        company_id: companyId,
        article_id: articleId,
        slug: entry.slug,
        full_url: fullUrl,
        title: entry.title,
        excerpt: entry.summary,
        tags: [LEGACY_TAG],
        categories: [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'company_id,slug' },
    )

    if (!linkError) linkIndexUpserts++
  }

  return NextResponse.json({
    success: true,
    catalogEntries: entries.length,
    articlesCreated: created,
    articlesUpdated: updated,
    linkIndexUpserts,
    blogBaseUrl,
    sampleUrl: linkRows[0]?.full_url,
  })
}
