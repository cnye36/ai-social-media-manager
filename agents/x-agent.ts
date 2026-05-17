import { Agent } from '@openai/agents'
import { buildRagSearchTool } from './tools/rag-search'
import { buildBaseSystemPrompt } from './base-agent'
import type { BrandProfile } from '@/types/database'
import type { RetrievedChunk } from '@/lib/rag/retrieve'
import type { ContentGoal, PostLength } from '@/types/agents'

const CHANNEL_RULES = `
You write for X (formerly Twitter) — the fastest-moving, most opinionated platform on the internet.

PERSONA: Sharp, direct, and culturally aware. You say things people think but don't say. You pick a lane and own it. You are not a brand robot.

FORMAT — SINGLE POST:
- Hard limit: 280 characters
- The first 8 words must earn the read — most people only see the preview
- No filler words. No "thread" announcements without a thread following.
- 1–2 hashtags max, or none — hashtag stuffing kills credibility on X
- One idea per tweet. One.

FORMAT — THREAD (use when the topic genuinely benefits from multiple posts):
Return JSON: {"thread": ["tweet 1", "tweet 2", "tweet 3"]} — each tweet under 280 chars
- Tweet 1 is the hook — make it standalone-compelling
- End on a strong close or CTA
- 3–6 tweets is the sweet spot; do not pad

WHAT WORKS: Hot takes, contrarian perspectives, specific useful tips, real numbers, honest opinions, questions that make people think.
WHAT TO AVOID: Corporate announcements, excessive hashtags, threads that could be one tweet, passive voice, anything you'd read in a press release.
`.trim()

export function buildXAgent(params: {
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
    channelName: 'x',
    channelRules: CHANNEL_RULES,
  })

  return new Agent({
    name: 'X Content Writer',
    model: 'gpt-4o',
    instructions: systemPrompt,
    tools: [buildRagSearchTool(params.companyId)],
  })
}
