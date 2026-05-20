import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { retrieve } from '@/lib/rag/retrieve'

export const maxDuration = 60

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export interface GeneratedFrontmatter {
  metaTitle: string
  metaDescription: string
  slug: string
  categories: string[]
  tags: string[]
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

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { companyId, title, additionalContext, siteId } = body as {
    companyId: string
    title: string
    additionalContext?: string
    siteId?: string
  }

  if (!companyId || !title?.trim()) {
    return NextResponse.json({ error: 'companyId and title required' }, { status: 400 })
  }

  const { data: company } = await supabase
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .eq('owner_id', user.id)
    .single()
  if (!company) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Fetch link index for internal linking
  const { data: linkIndex } = await supabase
    .from('article_link_index')
    .select('full_url, title, excerpt, tags, categories')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false })
    .limit(20)

  const [{ data: brand }, chunks] = await Promise.all([
    supabase.from('brand_profiles').select('*').eq('company_id', companyId).maybeSingle(),
    retrieve(companyId, title, 6, 0.3).catch(() => [] as Awaited<ReturnType<typeof retrieve>>),
  ])

  const brandContext = [
    `Company: ${company.name}`,
    brand?.company_description && `About: ${brand.company_description}`,
    brand?.products_services && `Products/services: ${brand.products_services}`,
    brand?.value_proposition && `Value proposition: ${brand.value_proposition}`,
    brand?.tone && `Tone: ${brand.tone}`,
    brand?.voice_notes && `Voice: ${brand.voice_notes}`,
    brand?.target_audience && `Target audience: ${brand.target_audience}`,
    brand?.keywords?.length && `Keywords: ${brand.keywords.join(', ')}`,
    brand?.avoid_phrases?.length && `Avoid: ${brand.avoid_phrases.join(', ')}`,
  ].filter(Boolean).join('\n')

  const knowledgeContext = chunks.length
    ? '\n\nRelevant company knowledge:\n' + chunks.map(c => (c.title ? `[${c.title}]\n${c.content}` : c.content)).join('\n\n---\n\n')
    : ''

  const internalLinksContext = linkIndex?.length
    ? '\n\nAvailable internal links (use 2-4 of the most relevant ones naturally within the article body as markdown links):\n' +
      linkIndex.map(l => `- [${l.title}](${l.full_url})${l.excerpt ? ` — ${l.excerpt}` : ''}`).join('\n')
    : ''

  const systemPrompt = `You are an expert blog writer and SEO specialist for ${company.name}.

${brandContext}${knowledgeContext}${internalLinksContext}

Write a complete, high-quality, SEO-optimized blog post in Markdown. Requirements:
- 800–1400 words
- Tone matches brand voice exactly
- Clear structure: engaging intro (hook with a question or bold statement), 3–5 H2 sections with substance, strong conclusion with CTA
- Weave in 2–4 internal links from the list above where they fit naturally — use the exact markdown link format
- No filler — every sentence adds value for the target reader
- Use code blocks with language labels where relevant (e.g., \`\`\`javascript)
- Do NOT include a title (H1) at the top — the title is handled separately
- End with a clear CTA relevant to ${company.name}'s products/services

Also return a JSON frontmatter object. Respond with ONLY this JSON structure (the body field contains the full markdown article):
{
  "body": "...full markdown article...",
  "frontmatter": {
    "metaTitle": "SEO-optimized title under 60 chars",
    "metaDescription": "Compelling meta description under 155 chars that makes people click",
    "slug": "url-friendly-slug-max-60-chars",
    "categories": ["Category1", "Category2"],
    "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
  }
}`

  const userPrompt = [
    `Article title: "${title}"`,
    additionalContext ? `Additional context: ${additionalContext}` : '',
  ].filter(Boolean).join('\n')

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 3000,
      temperature: 0.7,
      response_format: { type: 'json_object' },
    })

    const raw = completion.choices[0]?.message?.content ?? '{}'
    const parsed = JSON.parse(raw) as { body?: string; frontmatter?: GeneratedFrontmatter }

    const frontmatter: GeneratedFrontmatter = {
      metaTitle: parsed.frontmatter?.metaTitle ?? title.slice(0, 60),
      metaDescription: parsed.frontmatter?.metaDescription ?? '',
      slug: parsed.frontmatter?.slug ?? titleToSlug(title),
      categories: parsed.frontmatter?.categories ?? [],
      tags: parsed.frontmatter?.tags ?? [],
    }

    // Apply site default author if provided
    if (siteId) {
      const { data: site } = await supabase.from('blog_sites').select('default_author').eq('id', siteId).single()
      if (site) {
        return NextResponse.json({ body: parsed.body ?? '', frontmatter, defaultAuthor: site.default_author })
      }
    }

    return NextResponse.json({ body: parsed.body ?? '', frontmatter })
  } catch (err) {
    console.error('Article generation error:', err)
    return NextResponse.json({ error: 'Failed to generate article' }, { status: 500 })
  }
}
