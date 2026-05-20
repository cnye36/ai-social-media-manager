import { Agent, webSearchTool } from '@openai/agents'
import { buildRagSearchTool } from './tools/rag-search'
import type { BrandProfile } from '@/types/database'
import type { ArticleFormat } from '@/types/agents'

const FORMAT_INSTRUCTIONS: Record<ArticleFormat, string> = {
  blog_post: `FORMAT: Standard Long-Form Blog Post (1,500–2,000 words)
- Opening paragraph hooks readers immediately — use a question, surprising stat, or bold statement
- 4–6 H2 sections with clear, benefit-driven subheadings
- Use H3 for sub-points within sections when needed
- Each section: 200–350 words with concrete examples, actionable takeaways
- Sprinkle 3–5 bullet or numbered lists throughout for scannability
- Strong conclusion (150–200 words) with a single focused CTA
- Cite 3–5 authoritative external sources inline using markdown links`,

  listicle: `FORMAT: Listicle (1,500–2,000 words)
- Title must follow "X [Things/Ways/Tips/Strategies/Mistakes/Tools] to [Outcome]" pattern
- Opening intro (150–200 words): frame the problem and promise of the list
- Each list item as a numbered H2: "## 1. Item Name" 
- Per item: 150–250 words — clear explanation, a real-world example or stat, and a practical takeaway
- Aim for 8–12 items depending on depth per item
- Closing section (100–150 words): "The Bottom Line" or similar wrap-up with CTA
- Cite authoritative sources inline for stats/claims (3–5 total)`,

  deep_dive: `FORMAT: Deep Dive / Comprehensive Guide (2,000–2,500 words)
- Opening: "What You'll Learn" summary block, then a compelling intro
- Minimum 5 H2 sections, each with 2–3 H3 subsections
- Include: definition/background, why it matters, how it works, best practices, common pitfalls, real examples, expert perspectives
- Use comparison tables, code blocks, or structured breakdowns where they add clarity
- Data-driven: include stats, research citations, case studies (5–8 external citations)
- "Key Takeaways" summary before conclusion
- Conclusion with strong CTA
- Optional "Further Reading" section at the end`,
}

export function buildBlogAgent(params: {
  companyId: string
  companyName: string
  brand: BrandProfile | null
  articleFormat: ArticleFormat
  internalLinksContext: string
  knowledgeContext: string
}) {
  const { companyId, companyName, brand, articleFormat, internalLinksContext, knowledgeContext } = params

  const brandSection = brand ? `BRAND VOICE:
- Tone: ${brand.tone}
- Voice: ${brand.voice_notes || 'Match the tone above'}
- Target audience: ${brand.target_audience || 'General business audience'}
- Keywords to weave in naturally: ${brand.keywords?.join(', ') || 'None specified'}
- Phrases to avoid: ${brand.avoid_phrases?.join(', ') || 'None'}` : 'BRAND VOICE: Professional, clear, authoritative.'

  const formatInstructions = FORMAT_INSTRUCTIONS[articleFormat]

  const systemPrompt = `You are an expert blog writer and SEO specialist for ${companyName}. You write world-class, high-ranking blog content that educates, engages, and converts readers.

${brandSection}

${knowledgeContext ? `COMPANY KNOWLEDGE (treat as ground truth):\n${knowledgeContext}\n` : ''}

${internalLinksContext ? `INTERNAL LINKS (weave 2–4 of the most relevant ones into the article body as markdown links — use natural anchor text, never "click here"):\n${internalLinksContext}\n` : ''}

YOUR WRITING APPROACH:
1. First, use the web_search tool to find 2–3 authoritative sources relevant to the article topic. Look for recent statistics, expert quotes, and industry data that will add credibility.
2. Use search_company_knowledge for any company-specific facts you need.
3. Then write the complete article following the format instructions below.

${formatInstructions}

UNIVERSAL WRITING RULES:
- Write like a knowledgeable human, not an AI — vary sentence length, use contractions, avoid hollow phrases ("leverage", "delve into", "in today's fast-paced world")
- Never start a section by just restating the heading
- Every paragraph must earn its place — cut anything that doesn't add value
- Use markdown properly: **bold** for key terms, *italic* for emphasis, \`code\` for technical terms, > blockquote for notable quotes
- Do NOT include an H1 at the top — the article title is handled separately
- End with a clear, specific CTA tied to ${companyName}'s actual products or services

OUTPUT: Return ONLY the complete markdown article body — no preamble, no "here's the article", no explanation.`

  return new Agent({
    name: 'Blog Content Writer',
    model: 'gpt-5.4',
    instructions: systemPrompt,
    tools: [
      webSearchTool(),
      buildRagSearchTool(companyId),
    ],
  })
}
