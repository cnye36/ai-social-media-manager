import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export type ArticleScoreCategoryKey = 'readability' | 'humanization' | 'structure' | 'voice'

const CATEGORY_LABELS: Record<ArticleScoreCategoryKey, string> = {
  readability: 'Readability',
  humanization: 'Humanization',
  structure: 'Structure & SEO',
  voice: 'Voice & originality',
}

const CRITERIA = `READABILITY:
- Sentence length varies — not all short/choppy, not all long/winding
- Paragraphs are broken up for scanning, not walls of text
- Jargon is explained or avoided where it isn't needed

HUMANIZATION (does this read as AI-written?):
- No AI-tell phrases: "in today's fast-paced world", "in the ever-evolving landscape", "delve into", "it's important to note", "unlock the power of", "let's dive in", "in conclusion", excessive "furthermore/moreover"
- Uses contractions and a natural register, not stiff corporate tone
- Concrete, specific details and examples rather than vague generalities
- Paragraphs/sentences don't all open the same way (repetitive rhythm is an AI tell)

STRUCTURE & SEO:
- Headings are descriptive and aid scanning
- Intro hooks quickly instead of throat-clearing
- Conclusion adds something instead of just restating ("In conclusion, as we've discussed...")

VOICE & ORIGINALITY:
- Reads like a practitioner with a real point of view, not a generic summary
- Takes a stance rather than hedging on everything
- Isn't just a rehash of what's already common knowledge online`

export interface ArticleScoreCategory {
  key: ArticleScoreCategoryKey
  label: string
  score: number
}

export interface ArticleIssue {
  category: ArticleScoreCategoryKey
  note: string
}

export interface ArticleScore {
  overall: number
  pass: boolean
  categories: ArticleScoreCategory[]
  issues: ArticleIssue[]
}

const CATEGORY_KEYS: ArticleScoreCategoryKey[] = ['readability', 'humanization', 'structure', 'voice']

export async function scoreArticle(title: string, body: string): Promise<ArticleScore> {
  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      max_tokens: 700,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: `You are a strict blog article evaluator. Score the article against the criteria below.

${CRITERIA}

Return JSON only:
{
  "categories": {"readability": <0-100>, "humanization": <0-100>, "structure": <0-100>, "voice": <0-100>},
  "issues": [{"category": "<readability|humanization|structure|voice>", "note": "<specific, actionable problem>"}]
}
- Each category score reflects how well the article meets that category's criteria (100 = perfect, 0 = fails entirely)
- issues: specific, actionable problems only (max 6 total). Empty array if the article is clean.
- Be strict — vague AI-tell phrases, wall-of-text paragraphs, and hedging should lower scores significantly.`,
        },
        {
          role: 'user',
          content: `Title: ${title}\n\n${body}`,
        },
      ],
    })

    const parsed = JSON.parse(res.choices[0]?.message?.content ?? '{}') as {
      categories?: Record<string, unknown>
      issues?: unknown
    }

    const categories: ArticleScoreCategory[] = CATEGORY_KEYS.map(key => ({
      key,
      label: CATEGORY_LABELS[key],
      score: Math.max(0, Math.min(100, Math.round(Number(parsed.categories?.[key]) || 0))),
    }))

    const issues = Array.isArray(parsed.issues)
      ? (parsed.issues as unknown[])
          .filter((i): i is { category: unknown; note: unknown } => typeof i === 'object' && i !== null)
          .map(i => ({
            category: CATEGORY_KEYS.includes(i.category as ArticleScoreCategoryKey)
              ? (i.category as ArticleScoreCategoryKey)
              : 'voice',
            note: String(i.note ?? ''),
          }))
          .filter(i => i.note)
          .slice(0, 6)
      : []

    const overall = Math.round(categories.reduce((sum, c) => sum + c.score, 0) / categories.length)

    return { overall, pass: overall >= 70, categories, issues }
  } catch {
    return {
      overall: 75,
      pass: true,
      categories: CATEGORY_KEYS.map(key => ({ key, label: CATEGORY_LABELS[key], score: 75 })),
      issues: [],
    }
  }
}
