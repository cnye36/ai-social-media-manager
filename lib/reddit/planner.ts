import OpenAI from 'openai'
import { z } from 'zod'
import { zodResponseFormat } from 'openai/helpers/zod'
import { addDays, format, startOfWeek } from 'date-fns'
import { buildBrandContext } from '@/lib/content-planning/brand-context'
import type { BrandProfile, Company } from '@/types/database'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// ─── Timing intelligence ───────────────────────────────────────────────────────

const TECH_SUBS = new Set([
  'webdev', 'programming', 'javascript', 'typescript', 'python', 'devops',
  'node', 'reactjs', 'nextjs', 'MachineLearning', 'datascience',
])

const BUSINESS_SUBS = new Set([
  'startups', 'SaaS', 'Entrepreneur', 'smallbusiness', 'marketing',
  'business', 'ecommerce', 'sales',
])

const AI_SUBS = new Set([
  'ArtificialIntelligence', 'AIAgents', 'ChatGPT', 'OpenAI',
  'automation', 'nocode', 'lowcode',
])

function subCategory(sub: string): 'tech' | 'business' | 'ai' | 'general' {
  const norm = sub.toLowerCase()
  if (TECH_SUBS.has(sub) || TECH_SUBS.has(norm)) return 'tech'
  if (AI_SUBS.has(sub) || AI_SUBS.has(norm)) return 'ai'
  if (BUSINESS_SUBS.has(sub) || BUSINESS_SUBS.has(norm)) return 'business'
  return 'general'
}

// Mon=0, Tue=1, Wed=2, Thu=3, Fri=4, Sat=5, Sun=6
const TIMING: Record<string, { days: number[]; window: string }> = {
  tech:     { days: [0, 1, 2, 3],    window: '6–9 AM ET'    },
  ai:       { days: [0, 1, 2, 3],    window: '7–10 AM ET'   },
  business: { days: [0, 1, 2, 3],    window: '8–11 AM ET'   },
  general:  { days: [1, 2, 3, 4],    window: '12–2 PM ET'   },
}

export interface PlannerSlot {
  date: string           // ISO YYYY-MM-DD
  dayLabel: string       // "Monday"
  subreddit: string
  timeWindow: string
  postType: 'story' | 'question' | 'resource' | 'discussion' | 'analysis' | 'ama'
  suggestedTitle: string
  angle: string
  titleFormula: string
}

// ─── Slot frame builder ────────────────────────────────────────────────────────

interface SlotFrame {
  date: string
  dayLabel: string
  subreddit: string
  timeWindow: string
}

function buildSlotFrames(subreddits: string[], weekStart: Date): SlotFrame[] {
  // Ensure weekStart is a Monday
  const monday = startOfWeek(weekStart, { weekStartsOn: 1 })

  const frames: SlotFrame[] = []
  const lastDayUsed: Record<string, number> = {}

  // Sort subs by category priority (AI + business first — highest engagement)
  const sorted = [...subreddits].sort((a, b) => {
    const order = { ai: 0, business: 1, tech: 2, general: 3 }
    return order[subCategory(a)] - order[subCategory(b)]
  })

  // Post types to cycle through for variety
  const postTypes: PlannerSlot['postType'][] = [
    'story', 'question', 'discussion', 'resource', 'analysis', 'question', 'story',
  ]

  // Assign each sub to an optimal day, spacing repeats 3+ days apart
  for (const sub of sorted) {
    const { days, window } = TIMING[subCategory(sub)]

    // Find the best available day: preferred day from timing map, not within 3 days of last use
    let assigned: number | null = null
    for (const d of days) {
      const last = lastDayUsed[sub] ?? -99
      if (d - last >= 3 || last === -99) {
        assigned = d
        break
      }
    }

    // If no preferred day is free, take any day that's available
    if (assigned === null) {
      for (let d = 0; d <= 6; d++) {
        const last = lastDayUsed[sub] ?? -99
        if (d - last >= 3) {
          assigned = d
          break
        }
      }
    }

    if (assigned === null) continue // shouldn't happen with <=7 subs

    lastDayUsed[sub] = assigned
    const date = addDays(monday, assigned)
    frames.push({
      date: format(date, 'yyyy-MM-dd'),
      dayLabel: format(date, 'EEEE'),
      subreddit: sub,
      timeWindow: window,
    })
  }

  // Sort chronologically
  frames.sort((a, b) => a.date.localeCompare(b.date))
  return frames
}

// ─── Zod schema for AI output ─────────────────────────────────────────────────

const PlanSlotSchema = z.object({
  subreddit: z.string(),
  postType: z.enum(['story', 'question', 'resource', 'discussion', 'analysis', 'ama']),
  suggestedTitle: z.string().describe('Specific, compelling, ready-to-use title under 200 chars'),
  angle: z.string().describe('One sentence: the hook, approach, and why this resonates in this sub'),
  titleFormula: z.string().describe(
    'Which formula was used: specificity | after-years | hot-take | curiosity-gap | fail-first | question | none',
  ),
})

const PlanOutputSchema = z.object({
  slots: z.array(PlanSlotSchema),
})

// ─── Main planner function ─────────────────────────────────────────────────────

export async function generateRedditWeeklyPlan(params: {
  subreddits: string[]
  weekStart: string // ISO date — will be normalized to that week's Monday
  topicFocus?: string
  company: Company
  brand: BrandProfile | null
  subredditConfigs?: Record<string, { posting_guidance: string | null; notes: string | null }>
}): Promise<PlannerSlot[]> {
  const { subreddits, topicFocus, company, brand, subredditConfigs = {} } = params

  if (subreddits.length === 0) throw new Error('No subreddits provided')

  const monday = startOfWeek(new Date(params.weekStart), { weekStartsOn: 1 })
  const frames = buildSlotFrames(subreddits, monday)

  if (frames.length === 0) throw new Error('Could not assign subreddits to days')

  const brandContext = buildBrandContext(company, brand)

  // Build subreddit-specific context summaries
  const subContextLines = subreddits.map(sub => {
    const cfg = subredditConfigs[sub]
    if (!cfg?.posting_guidance && !cfg?.notes) return `r/${sub}: no custom guidance`
    const lines = [`r/${sub}:`]
    if (cfg.posting_guidance) lines.push(`  Playbook: ${cfg.posting_guidance.slice(0, 300)}`)
    if (cfg.notes) lines.push(`  Notes: ${cfg.notes.slice(0, 150)}`)
    return lines.join('\n')
  }).join('\n\n')

  // Build the slot assignments for the AI to fill in
  const frameList = frames.map(f =>
    `- r/${f.subreddit} on ${f.dayLabel} ${f.date} (best time: ${f.timeWindow})`
  ).join('\n')

  const systemPrompt = `You are a Reddit content strategist who writes for builders and founders.

Your job: generate a specific, viral-ready post idea for each slot in the weekly schedule below.

BRAND CONTEXT:
${brandContext}

SUBREDDIT PLAYBOOKS:
${subContextLines}

VIRAL TITLE FORMULAS (use these, don't just describe content):
- specificity: concrete number + outcome + timeframe. "grew X to Y in Z weeks" not "tips for growing X"
- after-years: persistence + change. "after N years of X, I finally figured out Y"
- hot-take: opinion most haven't heard. "most [people in field] are wrong about X"
- curiosity-gap: tease outcome, not lesson. "what actually happened when I tried X"
- fail-first: lead with failure, earn lesson. "I did X for 6 months — don't do X"
- question: debate the community has. "is X actually worth it for small teams?"

POST TYPE GUIDANCE:
- story: 1st-person experience, problem+tension+turn+landing
- question: genuine ask to the community, often starting the OP's own take
- resource: actionable breakdown — list, comparison, or guide
- discussion: debate-starter or take that invites disagreement
- analysis: data, patterns, or observations from doing the work
- ama: transparency post about a decision or outcome, invites questions

RULES:
- Titles must be specific and compelling — never generic ("my thoughts on X")
- No two slots on the same subreddit should have the same post type
- Angles must be distinct — avoid using the same hook twice across the week
- Zero marketing language. Subreddit-specific tone matters. A tech sub gets different energy than r/startups.
- Return exactly one slot object per entry in the assignment list, matching the subreddit field exactly.
${topicFocus ? `\nWEEKLY THEME: ${topicFocus} — weave this into titles/angles where it fits naturally, don't force it into every post.` : ''}`

  const userPrompt = `Generate post ideas for these slots:
${frameList}

Return one slot per entry. Match subreddit names exactly.`

  const completion = await openai.chat.completions.parse({
    model: 'gpt-5.4',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: zodResponseFormat(PlanOutputSchema, 'reddit_plan'),
    temperature: 0.7,
  })

  const parsed = completion.choices[0]?.message?.parsed
  if (!parsed) throw new Error('Failed to parse planner output')

  // Merge AI content back into the frames
  return frames.map(frame => {
    const slot = parsed.slots.find(s => s.subreddit === frame.subreddit)
    return {
      ...frame,
      postType: slot?.postType ?? 'discussion',
      suggestedTitle: slot?.suggestedTitle ?? `Post for r/${frame.subreddit}`,
      angle: slot?.angle ?? '',
      titleFormula: slot?.titleFormula ?? 'none',
    }
  })
}
