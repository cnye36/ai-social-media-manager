import { NextResponse } from 'next/server'
import { Agent, run, webSearchTool } from '@openai/agents'
import { createClient } from '@/lib/supabase/server'
import { retrieve } from '@/lib/rag/retrieve'
import { fetchBlogAgentContext } from '@/lib/blog/agent-context'
import { formatPromptDate } from '@/lib/content/current-date'
import type { ContentGoal } from '@/types/agents'
import type { ArticleFormat } from '@/types/agents'

export interface BlogIdea {
  title: string
  outline: string
  angle: ContentGoal
  /** The specific long-tail search phrase this idea targets. */
  keyword: string
}

const FORMAT_LABELS: Record<ArticleFormat, string> = {
  blog_post: 'standard blog post',
  listicle: 'listicle',
  deep_dive: 'deep-dive guide',
}

const FORMAT_TITLE_GUIDANCE: Record<ArticleFormat, string> = {
  blog_post: 'Standard titles like "How to X", "Why X Matters", "The Complete Guide to X"',
  listicle: 'Titles MUST follow the listicle pattern: "X Ways to Y", "X Mistakes to Avoid", "X Tools for Z", "X Reasons Why…"',
  deep_dive: 'Titles like "The Definitive Guide to X", "X: A Complete Technical Breakdown", "Everything You Need to Know About X"',
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { companyId, count = 8, articleFormat = 'blog_post' } = body as {
    companyId?: string
    count?: number
    articleFormat?: ArticleFormat
  }
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

  const { data: company } = await supabase
    .from('companies')
    .select('name, website_url')
    .eq('id', companyId)
    .eq('owner_id', user.id)
    .single()
  if (!company) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [{ data: brand }, agentContext, chunks] = await Promise.all([
    supabase
      .from('brand_profiles')
      .select('tone, target_audience, keywords, voice_notes, company_description, products_services')
      .eq('company_id', companyId)
      .maybeSingle(),
    fetchBlogAgentContext(supabase, companyId, company),
    retrieve(companyId, 'expertise how-to guides insights tutorials thought leadership value', 10, 0.3).catch(
      () => [] as Awaited<ReturnType<typeof retrieve>>
    ),
  ])

  const existingArticlesContext = [
    agentContext.ideasContext,
    agentContext.legacyPublishedContext,
  ]
    .filter(Boolean)
    .join('\n\n')

  const brandContext = [
    brand?.company_description && `About: ${brand.company_description}`,
    brand?.products_services && `Products/services: ${brand.products_services}`,
    brand?.tone && `Tone: ${brand.tone}`,
    brand?.target_audience && `Target audience: ${brand.target_audience}`,
    brand?.keywords?.length && `Key topics: ${brand.keywords.join(', ')}`,
  ]
    .filter(Boolean)
    .join('\n')

  const knowledgeContext = chunks.length
    ? chunks.map(c => (c.title ? `[${c.title}]\n${c.content}` : c.content)).join('\n\n---\n\n')
    : 'No knowledge base content yet.'

  const formatLabel = FORMAT_LABELS[articleFormat as ArticleFormat] ?? 'blog post'
  const titleGuidance = FORMAT_TITLE_GUIDANCE[articleFormat as ArticleFormat] ?? FORMAT_TITLE_GUIDANCE.blog_post

  const now = new Date()
  const currentDate = formatPromptDate(now)
  const currentYear = now.getFullYear()
  const seedTopic = brand?.keywords?.[0] || brand?.products_services || company.name

  const instructions = `You are a content strategist and SEO researcher for ${company.name}.

CURRENT DATE: ${currentDate}
Your training data has a knowledge cutoff before this date — don't rely on your internal sense of what's trending. Before proposing any ideas, use the web search tool (2–4 searches) to find what people are actually searching and asking about this company's topics right now. Include "${currentYear}" in at least one query so results skew current (e.g. "${seedTopic} trends ${currentYear}", "${seedTopic} questions ${currentYear}").

Brand context:
${brandContext}

Knowledge base:
${knowledgeContext}

${existingArticlesContext ? `${existingArticlesContext}\n\n` : ''}RESEARCH FIRST, THEN IDEATE:
1. Search for current discussions, questions, and trends related to this company's topics.
2. From what you find, identify specific LONG-TAIL keyword phrases — 4+ words, a specific question or intent, not a generic head term (e.g. "how to automate follow-ups for a small sales team" beats "sales automation") — that real people are currently searching for.
3. Build each idea around ONE such phrase. The title should read like a human headline satisfying that search intent, not a keyword-stuffed string.

Generate exactly ${count} fresh, specific ${formatLabel} ideas grounded in the company's actual expertise AND in what you found people are currently searching for.

TITLE FORMAT: ${titleGuidance}

Requirements:
- Each idea must be distinctly different from existing articles above
- Titles must be specific and immediately communicate the value to the reader
- "keyword" must be the actual long-tail phrase the idea targets, lowercase, as someone would type it into a search box
- Outlines are 1–2 sentences describing the unique angle, key sections, and what makes it valuable
- Vary the content goals across: education, engagement, promotion, awareness
- Ground ideas in the company's real expertise from the knowledge base

Return ONLY a JSON object in this exact shape, no markdown code fences, no commentary before or after it:
{
  "ideas": [
    {
      "title": "Specific, compelling title",
      "outline": "1–2 sentences describing angle, key sections, and unique value",
      "angle": "education" | "engagement" | "promotion" | "awareness",
      "keyword": "the long-tail search phrase this idea targets"
    }
  ]
}`

  try {
    const agent = new Agent({
      name: 'Blog Idea Strategist',
      model: 'gpt-5.6-terra',
      instructions,
      tools: [webSearchTool()],
    })

    const result = await run(agent, 'Research current trends now, then generate the ideas.')
    const raw = (result.finalOutput ?? '{}').trim()
      .replace(/```json\s*/gi, '')
      .replace(/```\s*$/g, '')
    const parsed = JSON.parse(raw) as { ideas?: BlogIdea[] }
    return NextResponse.json({ ideas: parsed.ideas ?? [] })
  } catch (err) {
    console.error('Blog idea generation error:', err)
    return NextResponse.json({ error: 'Failed to generate ideas' }, { status: 500 })
  }
}
