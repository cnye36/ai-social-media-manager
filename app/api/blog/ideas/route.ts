import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { retrieve } from '@/lib/rag/retrieve'
import type { ContentGoal } from '@/types/agents'
import type { ArticleFormat } from '@/types/agents'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export interface BlogIdea {
  title: string
  outline: string
  angle: ContentGoal
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
    .select('name')
    .eq('id', companyId)
    .eq('owner_id', user.id)
    .single()
  if (!company) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [{ data: brand }, { data: existing }, chunks] = await Promise.all([
    supabase
      .from('brand_profiles')
      .select('tone, target_audience, keywords, voice_notes, company_description, products_services')
      .eq('company_id', companyId)
      .maybeSingle(),
    supabase
      .from('articles')
      .select('title, scheduled_for')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(30),
    retrieve(companyId, 'expertise how-to guides insights tutorials thought leadership value', 10, 0.3).catch(
      () => [] as Awaited<ReturnType<typeof retrieve>>
    ),
  ])

  const existingTitles = existing?.map(a => `- "${a.title}"`).join('\n') ?? ''

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

  const prompt = `You are a content strategist for ${company.name}.

Brand context:
${brandContext}

Knowledge base:
${knowledgeContext}

${existingTitles ? `Already written (do NOT suggest these or close variants):\n${existingTitles}\n` : ''}
Generate exactly ${count} fresh, specific ${formatLabel} ideas grounded in the company's actual expertise.

TITLE FORMAT: ${titleGuidance}

Requirements:
- Each idea must be distinctly different from existing articles above
- Titles must be specific and immediately communicate the value to the reader
- Outlines are 1–2 sentences describing the unique angle, key sections, and what makes it valuable
- Vary the content goals across: education, engagement, promotion, awareness
- Ground ideas in the company's real expertise from the knowledge base

Return a JSON object:
{
  "ideas": [
    {
      "title": "Specific, compelling title",
      "outline": "1–2 sentences describing angle, key sections, and unique value",
      "angle": "education" | "engagement" | "promotion" | "awareness"
    }
  ]
}`

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.9,
      response_format: { type: 'json_object' },
    })

    const raw = completion.choices[0]?.message?.content ?? '{}'
    const parsed = JSON.parse(raw) as { ideas?: BlogIdea[] }
    return NextResponse.json({ ideas: parsed.ideas ?? [] })
  } catch (err) {
    console.error('Blog idea generation error:', err)
    return NextResponse.json({ error: 'Failed to generate ideas' }, { status: 500 })
  }
}
