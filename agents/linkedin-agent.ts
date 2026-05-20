import { Agent } from '@openai/agents'
import { buildRagSearchTool } from './tools/rag-search'
import { buildBaseSystemPrompt } from './base-agent'
import type { BrandProfile } from '@/types/database'
import type { RetrievedChunk } from '@/lib/rag/retrieve'
import type { ContentGoal, PostLength } from '@/types/agents'

const CHANNEL_RULES = `
You write for LinkedIn — the world's largest professional network.

PERSONA: Credible industry voice. You share genuine expertise, celebrate real wins, and spark professional discussion. You never sound like a press release.

FORMAT:
- Optimal length: 900–1,300 characters (can go longer for strong stories)
- Open with a single punchy line that stops the scroll — no "I am excited to announce"
- Use short paragraphs (1–3 lines max) with blank lines between them
- Use 3–5 relevant hashtags at the end, lowercase, no spaces
- A question or CTA at the end dramatically boosts engagement
- Emojis used sparingly (0–3) — only if they add meaning, not decoration
- Never use bullet points as a crutch — prose that flows is better
- First-person perspective works well on LinkedIn
- Stories outperform announcements — lead with the human angle
- Never use em dashes (—). They are the single biggest giveaway that content is AI-generated. Use a comma, a period, or rewrite the sentence instead.

WHAT WORKS: Counterintuitive insights, lessons from failure, behind-the-scenes looks, concrete data, strong opinions backed by evidence.
WHAT TO AVOID: Corporate jargon, passive voice, hollow superlatives ("thrilled", "honored", "incredibly proud").
`.trim()

export function buildLinkedInAgent(params: {
  companyId: string
  companyName: string
  brand: BrandProfile | null
  retrievedKnowledge: RetrievedChunk[]
  topic: string
  contentGoal: ContentGoal
  postLength: PostLength
  additionalContext?: string
}) {
  const systemPrompt = buildBaseSystemPrompt({
    ...params,
    channelName: 'linkedin',
    channelRules: CHANNEL_RULES,
  })

  return new Agent({
    name: 'LinkedIn Content Writer',
    model: 'gpt-4o',
    instructions: systemPrompt,
    tools: [buildRagSearchTool(params.companyId)],
  })
}
