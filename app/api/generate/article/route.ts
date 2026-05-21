import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { run } from '@openai/agents'
import { createClient } from '@/lib/supabase/server'
import { retrieve } from '@/lib/rag/retrieve'
import { buildBlogAgent } from '@/agents/blog-agent'
import type { ArticleFormat } from '@/types/agents'

export const maxDuration = 120

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export interface GeneratedFrontmatter {
  metaTitle: string
  metaDescription: string
  slug: string
  categories: string[]
  tags: string[]
  featuredImageAlt: string
}

function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
}

const VALID_FORMATS: ArticleFormat[] = ['blog_post', 'listicle', 'deep_dive']

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { companyId, title, additionalContext, siteId, articleFormat: rawFormat } = body as {
    companyId: string
    title: string
    additionalContext?: string
    siteId?: string
    articleFormat?: ArticleFormat
  }

  if (!companyId || !title?.trim()) {
    return NextResponse.json({ error: 'companyId and title required' }, { status: 400 })
  }

  const articleFormat: ArticleFormat = VALID_FORMATS.includes(rawFormat as ArticleFormat)
    ? (rawFormat as ArticleFormat)
    : 'blog_post'

  const { data: company } = await supabase
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .eq('owner_id', user.id)
    .single()
  if (!company) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Fetch all supporting context in parallel
  const [{ data: brand }, { data: linkIndex }, chunks] = await Promise.all([
    supabase.from('brand_profiles').select('*').eq('company_id', companyId).maybeSingle(),
    supabase
      .from('article_link_index')
      .select('full_url, title, excerpt, tags, categories')
      .eq('company_id', companyId)
      .order('updated_at', { ascending: false })
      .limit(20),
    retrieve(companyId, title, 6, 0.3).catch(() => [] as Awaited<ReturnType<typeof retrieve>>),
  ])

  const knowledgeContext = chunks.length
    ? 'Relevant company knowledge:\n' +
      chunks.map(c => (c.title ? `[${c.title}]\n${c.content}` : c.content)).join('\n\n---\n\n')
    : ''

  const internalLinksContext = linkIndex?.length
    ? linkIndex
        .map(l => `- [${l.title}](${l.full_url})${l.excerpt ? ` — ${l.excerpt}` : ''}`)
        .join('\n')
    : ''

  // ── Phase 1: Generate a detailed outline ──────────────────────────────────
  const formatLabel = { blog_post: 'blog post', listicle: 'listicle', deep_dive: 'deep dive' }[articleFormat]

  const outlinePrompt = `Create a detailed outline for this ${formatLabel}: "${title}"${additionalContext ? `\nContext: ${additionalContext}` : ''}

Return a JSON object:
{
  "outline": "The full outline as markdown (H2s and H3s, each with 1 sentence description of what to cover)",
  "angle": "1-2 sentences explaining the unique angle/hook for this article"
}`

  let outline = ''
  try {
    const outlineRes = await openai.chat.completions.create({
      model: 'gpt-5.4-mini',
      messages: [
        {
          role: 'system',
          content: `You are a content strategist for ${company.name}. ${brand?.tone ? `Brand tone: ${brand.tone}.` : ''} ${brand?.target_audience ? `Target audience: ${brand.target_audience}.` : ''}`,
        },
        { role: 'user', content: outlinePrompt },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 800,
      temperature: 0.7,
    })
    const parsed = JSON.parse(outlineRes.choices[0]?.message?.content ?? '{}') as {
      outline?: string
      angle?: string
    }
    outline = [parsed.angle && `Unique angle: ${parsed.angle}`, parsed.outline].filter(Boolean).join('\n\n')
  } catch {
    // Non-fatal — continue without outline
  }

  // ── Phase 2: Write the article using the blog agent (web search + RAG) ────
  const writePrompt = [
    `Write a complete ${formatLabel} for the title: "${title}"`,
    additionalContext && `Additional context: ${additionalContext}`,
    outline && `\nFollow this outline:\n${outline}`,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const agent = buildBlogAgent({
      companyId,
      companyName: company.name,
      brand: brand ?? null,
      articleFormat,
      internalLinksContext,
      knowledgeContext,
    })

    const agentResult = await run(agent, writePrompt)
    const articleBody = agentResult.finalOutput?.trim() ?? ''

    if (!articleBody) {
      return NextResponse.json({ error: 'Agent returned empty article' }, { status: 500 })
    }

    // ── Phase 3: Generate SEO frontmatter from the written article ───────────
    const frontmatterRes = await openai.chat.completions.create({
      model: 'gpt-5.4-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an SEO specialist. Generate optimized frontmatter metadata for the given article.',
        },
        {
          role: 'user',
          content: `Article title: "${title}"

Article body (first 1000 chars):
${articleBody.slice(0, 1000)}

Return JSON with ALL fields:
{
  "metaTitle": "SEO title max 60 chars",
  "metaDescription": "Compelling meta description max 155 chars that makes people click",
  "slug": "url-friendly-slug-max-60-chars",
  "categories": ["Proper Case Category", "Another Category"],
  "tags": ["Proper Case Tag", "Another Tag", "Tag Three", "Tag Four", "Tag Five"],
  "featuredImageAlt": "Vivid, descriptive alt text for the blog featured image — describe what the image should depict visually in 1-2 sentences, referencing the article topic and brand aesthetics"
}`,
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 500,
      temperature: 0.4,
    })

    const rawFm = JSON.parse(frontmatterRes.choices[0]?.message?.content ?? '{}') as Partial<GeneratedFrontmatter>

    const frontmatter: GeneratedFrontmatter = {
      metaTitle: rawFm.metaTitle ?? title.slice(0, 60),
      metaDescription: rawFm.metaDescription ?? '',
      slug: rawFm.slug ?? titleToSlug(title),
      categories: rawFm.categories ?? [],
      tags: rawFm.tags ?? [],
      featuredImageAlt: rawFm.featuredImageAlt ?? `Featured image for article: ${title}`,
    }

    // Apply site default author if provided
    if (siteId) {
      const { data: site } = await supabase
        .from('blog_sites')
        .select('default_author')
        .eq('id', siteId)
        .single()
      if (site) {
        return NextResponse.json({ body: articleBody, frontmatter, defaultAuthor: site.default_author })
      }
    }

    return NextResponse.json({ body: articleBody, frontmatter })
  } catch (err) {
    console.error('Article generation error:', err)
    return NextResponse.json({ error: 'Failed to generate article' }, { status: 500 })
  }
}
