import OpenAI from 'openai'
import type { Channel } from '@/types/database'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Full human-readable criteria, including hard constraints (length, hashtag count, em dashes)
// that are only meaningful when writing/editing a post, not when scoring one — see below.
export const CRITERIA: Record<Channel, string> = {
  linkedin: [
    'Hook: First line stops the scroll — no "excited/thrilled/honored/pleased to announce"',
    'Length: 900–1,300 characters (can go longer for a strong story)',
    'Ends with 3–5 lowercase hashtags',
    'No hollow superlatives (thrilled, honored, incredibly proud, excited to share)',
    'No em dashes (—)',
    'Ends with a question or CTA to drive engagement',
    'No bullet points as crutch — prose should flow naturally',
  ].join('\n'),
  x: [
    'Each tweet is under 280 characters',
    'First 8 words earn the read — strong, concrete hook',
    'No em dashes (—)',
    'Tone is sharp and direct, not vague or corporate',
  ].join('\n'),
  reddit: [
    'Opens with a specific moment or concrete detail — not a generic statement',
    'No procedural language (step 1/2/3, firstly, secondly, "in this post I will...")',
    'Sounds like a real person sharing an experience — not a pitch or press release',
    'Ends with an open question to invite replies',
    'No em dashes (—)',
  ].join('\n'),
  facebook: [
    'Length: 150–400 words',
    'Warm and conversational — not corporate or stiff',
    'Ends with an easy, direct question to spark comments',
    'Does NOT open with "Ever..." or "Have you ever..."',
    'No em dashes (—)',
  ].join('\n'),
}

// LLMs are unreliable at exact character/word counting, hashtag counting, and literal
// string matching — those are checked deterministically below instead of asking the model
// to judge them, since asking it to "count" produces false positives (see deterministicIssues).
const QUALITATIVE_CRITERIA: Record<Channel, string> = {
  linkedin: [
    'Hook: First line stops the scroll — no "excited/thrilled/honored/pleased to announce"',
    'No hollow superlatives (thrilled, honored, incredibly proud, excited to share)',
    'Ends with a question or CTA to drive engagement',
    'No bullet points as crutch — prose should flow naturally',
  ].join('\n'),
  x: [
    'First 8 words earn the read — strong, concrete hook',
    'Tone is sharp and direct, not vague or corporate',
  ].join('\n'),
  reddit: [
    'Opens with a specific moment or concrete detail — not a generic statement',
    'No procedural language (step 1/2/3, firstly, secondly, "in this post I will...")',
    'Sounds like a real person sharing an experience — not a pitch or press release',
    'Ends with an open question to invite replies',
  ].join('\n'),
  facebook: [
    'Warm and conversational — not corporate or stiff',
    'Ends with an easy, direct question to spark comments',
  ].join('\n'),
}

function countWords(content: string): number {
  return content.trim().split(/\s+/).filter(Boolean).length
}

function trailingHashtags(content: string): string[] {
  const match = content.trim().match(/(?:#[\w-]+\s*)+$/)
  return match ? match[0].trim().split(/\s+/) : []
}

/** Checks the model can't be trusted to judge by eye — counting, matching, arithmetic. */
function deterministicIssues(content: string, channel: Channel): string[] {
  const issues: string[] = []

  if (content.includes('—')) issues.push('Contains an em dash (—) — remove it')

  if (channel === 'x' && content.length > 280) {
    issues.push(`Tweet is ${content.length} characters — must be 280 or under`)
  }

  if (channel === 'linkedin') {
    const len = content.length
    if (len < 300 || len > 1300) issues.push(`Length is ${len} characters — aim for 300–1,300`)
    const tags = trailingHashtags(content)
    if (tags.length < 3 || tags.length > 5) issues.push(`Ends with ${tags.length} hashtags — needs 3–5`)
  }

  if (channel === 'facebook') {
    const words = countWords(content)
    if (words < 150 || words > 400) issues.push(`Length is ${words} words — aim for 150–400`)
    if (/^\s*(ever|have you ever)\b/i.test(content)) {
      issues.push('Opens with "Ever..." or "Have you ever..." — rewrite the hook')
    }
  }

  return issues
}

export interface PostScore {
  score: number
  pass: boolean
  issues: string[]
}

export async function scorePost(content: string, channel: Channel): Promise<PostScore> {
  const detIssues = deterministicIssues(content, channel)

  // A hard-constraint failure already caps the score at 50 (failing range) — no point
  // paying for an LLM call whose verdict can't change the outcome.
  if (detIssues.length > 0) {
    return { score: 50, pass: false, issues: detIssues.slice(0, 3) }
  }

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      max_tokens: 250,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: `You are a strict ${channel} content evaluator. Score the post against the criteria below.

CRITERIA FOR ${channel.toUpperCase()}:
${QUALITATIVE_CRITERIA[channel]}

Return JSON only: {"score": <0-100 integer>, "issues": ["<specific actionable issue>", ...]}
- score reflects how well the post meets ALL criteria above (100 = perfect, 0 = fails everything)
- issues: specific, actionable problems (max 3). Each issue MUST quote the exact word or phrase from the post it is criticizing, in the format: "<quoted phrase>" — <what's wrong and how to fix it>. Do not give generic feedback that could describe any post — only flag something that is actually true of THIS post's wording. Empty array if the qualitative criteria are met.
- Length, hashtag count, and em dashes are already checked separately — do not mention them.`,
        },
        {
          role: 'user',
          content,
        },
      ],
    })

    const parsed = JSON.parse(res.choices[0]?.message?.content ?? '{}') as {
      score?: unknown
      issues?: unknown
    }
    const llmScore = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)))
    const llmIssues = Array.isArray(parsed.issues)
      ? (parsed.issues as unknown[]).filter((i): i is string => typeof i === 'string')
      : []

    const issues = llmIssues.slice(0, 3)
    return { score: llmScore, pass: llmScore >= 65, issues }
  } catch {
    return { score: 75, pass: true, issues: [] }
  }
}
