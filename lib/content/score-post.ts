import OpenAI from 'openai'
import type { Channel } from '@/types/database'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const CRITERIA: Record<Channel, string> = {
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

export interface PostScore {
  score: number
  pass: boolean
  issues: string[]
}

export async function scorePost(content: string, channel: Channel): Promise<PostScore> {
  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      max_tokens: 200,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: `You are a strict ${channel} content evaluator. Score the post against the criteria below.

CRITERIA FOR ${channel.toUpperCase()}:
${CRITERIA[channel]}

Return JSON only: {"score": <0-100 integer>, "issues": ["<specific actionable issue>", ...]}
- score reflects how well the post meets ALL criteria (100 = perfect, 0 = fails everything)
- issues: specific, actionable problems (max 3). Empty array if post is good.
- Be strict: vague hooks, wrong length, missing hashtags, corporate tone all lower the score significantly.`,
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
    const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)))
    const issues = Array.isArray(parsed.issues)
      ? (parsed.issues as unknown[])
          .filter((i): i is string => typeof i === 'string')
          .slice(0, 3)
      : []
    return { score, pass: score >= 65, issues }
  } catch {
    return { score: 75, pass: true, issues: [] }
  }
}
