import OpenAI from 'openai'
import { z } from 'zod'
import { zodResponseFormat } from 'openai/helpers/zod'
import { addDays, eachDayOfInterval, format, parseISO } from 'date-fns'
import type { SupabaseClient } from '@supabase/supabase-js'
import { retrieve } from '@/lib/rag/retrieve'
import { buildBrandContext, summarizePastPosts } from './brand-context'
import {
  assignSlotTimes,
  buildPlaybookPromptSection,
  calculateChannelSlotTargets,
  getPlaybook,
} from './channel-playbook'
import { analyzePostingInsights } from './posting-insights'
import type { Channel, Company, Post } from '@/types/database'
import type { ContentPillar, CreateContentPlanRequest } from '@/types/content-planning'
import type { ContentGoal, PostLength } from '@/types/agents'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const PlanSlotSchema = z.object({
  channel: z.enum(['linkedin', 'x', 'reddit', 'facebook']),
  scheduled_date: z.string().describe('ISO date YYYY-MM-DD within the plan range'),
  post_type: z.string().describe(
    'Channel-specific format: X must use "single" or "thread". LinkedIn: thought_leadership, carousel, poll, story. Facebook: community, story, update. Reddit: discussion, story.',
  ),
  pillar: z.string().nullable(),
  topic: z.string().describe('Specific angle for the writer — not the full post'),
  content_goal: z.enum(['awareness', 'engagement', 'promotion', 'education']),
  post_length: z.enum(['short', 'medium', 'long']),
  notes: z.string().nullable(),
})

const PlanOutputSchema = z.object({
  strategy_summary: z.string(),
  content_pillars: z.array(z.object({
    name: z.string(),
    description: z.string(),
    frequency: z.string(),
    example_topics: z.array(z.string()),
  })),
  slots: z.array(PlanSlotSchema),
})

export async function generateContentPlan(
  supabase: SupabaseClient,
  request: CreateContentPlanRequest,
): Promise<{ planId: string }> {
  const { companyId, name, startDate, endDate, channels, additionalContext } = request

  const start = parseISO(startDate)
  const end = parseISO(endDate)
  const dayCount = eachDayOfInterval({ start, end }).length

  const [{ data: company }, { data: brand }, { data: pastPosts }] = await Promise.all([
    supabase.from('companies').select('*').eq('id', companyId).single(),
    supabase.from('brand_profiles').select('*').eq('company_id', companyId).single(),
    supabase
      .from('posts')
      .select('*')
      .eq('company_id', companyId)
      .in('status', ['scheduled', 'published'])
      .order('scheduled_for', { ascending: false, nullsFirst: false })
      .limit(60),
  ])

  if (!company) throw new Error('Company not found')

  const historicalPosts = (pastPosts ?? []) as Post[]
  const postingInsights = analyzePostingInsights(historicalPosts, channels)
  const brandContext = buildBrandContext(company as Company, brand)
  const pastSummary = summarizePastPosts(historicalPosts)

  const knowledgeQuery = [
    additionalContext,
    brand?.company_description,
    brand?.products_services,
    'content pillars recurring social media themes',
  ].filter(Boolean).join(' ')

  const knowledgeChunks = await retrieve(companyId, knowledgeQuery, 8, 0.3).catch(() => [])
  const knowledgeText = knowledgeChunks.length
    ? knowledgeChunks.map(c => (c.title ? `[${c.title}]\n` : '') + c.content).join('\n\n---\n\n')
    : 'No knowledge base entries yet.'

  const channelTargets = calculateChannelSlotTargets(channels, dayCount)
  const totalTarget = Object.values(channelTargets).reduce((a, b) => a + b, 0)
  const targetBreakdown = channels
    .map(ch => `${getPlaybook(ch).label}: ${channelTargets[ch]} slots`)
    .join(', ')

  const { data: planRow, error: planError } = await supabase
    .from('content_plans')
    .insert({
      company_id: companyId,
      name,
      start_date: startDate,
      end_date: endDate,
      status: 'planning',
      channels,
      additional_context: additionalContext ?? null,
      posting_insights: postingInsights,
    })
    .select('id')
    .single()

  if (planError || !planRow) throw new Error(planError?.message ?? 'Failed to create plan')

  const systemPrompt = `You are the social media director for ${company.name}. Your job is to plan a content calendar — NOT write the posts yet.

Think like an in-house marketing lead who knows this company runs the same playbook every month: recycle proven content pillars, rotate formats, and leave room for timely announcements.

BRAND & COMPANY:
${brandContext}

PAST SCHEDULED/PUBLISHED POSTS (learn patterns, avoid repeating the same angle back-to-back):
${pastSummary}

KNOWLEDGE BASE:
${knowledgeText}

POSTING INSIGHTS (prefer these days/times when scheduling):
${JSON.stringify(postingInsights, null, 2)}

USER CONTEXT (prioritize timely posts for this):
${additionalContext?.trim() || 'None — focus on evergreen pillars and brand consistency.'}

═══════════════════════════════════════
PLATFORM PLAYBOOKS (follow exactly — these override generic social media advice)
═══════════════════════════════════════
${buildPlaybookPromptSection(channels)}

═══════════════════════════════════════
PLAN QUOTAS
═══════════════════════════════════════
- Date range: ${startDate} to ${endDate} (${dayCount} days)
- Channels: ${channels.join(', ')}
- Target slot counts: ${targetBreakdown} (≈${totalTarget} total)
- Each channel MUST stay within its min/max weekly cadence from the playbooks above
- Do NOT repeat the same topic within 5 days on the same channel
- Topics are brief briefs for writers (under 120 chars), not finished copy
- Use scheduled_date only (times are assigned automatically)
- Assign post_type and pillar so the team can recycle this plan monthly

X-SPECIFIC: You MUST include both "single" and "thread" post_types. Singles use post_length "short"; threads use post_length "long".
LINKEDIN-SPECIFIC: Never exceed 3 slots in any 7-day window. Never 2 LinkedIn posts on the same day.`

  const completion = await openai.chat.completions.parse({
    model: 'gpt-4.1',
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Create the content plan "${name}" from ${startDate} to ${endDate}. Return exactly the structured plan with ${totalTarget} slots distributed per platform quotas.`,
      },
    ],
    response_format: zodResponseFormat(PlanOutputSchema, 'content_plan'),
    temperature: 0.5,
  })

  const parsed = completion.choices[0].message.parsed
  if (!parsed) throw new Error('Failed to parse content plan from AI')

  const pillars = parsed.content_pillars as ContentPillar[]
  const normalizedSlots = normalizeSlotsForPlaybooks(
    parsed.slots,
    channels,
    startDate,
    endDate,
  )

  const timedSlots = assignSlotTimes(normalizedSlots, postingInsights)

  const slotsToInsert = timedSlots.map(({ slot, scheduledFor }, index) => ({
    plan_id: planRow.id,
    company_id: companyId,
    scheduled_for: scheduledFor.toISOString(),
    channel: slot.channel,
    post_type: slot.post_type,
    pillar: slot.pillar,
    topic: slot.topic,
    content_goal: slot.content_goal as ContentGoal,
    post_length: slot.post_length as PostLength,
    notes: slot.notes,
    status: 'planned' as const,
    sort_order: index,
  }))

  if (slotsToInsert.length > 0) {
    const { error: slotsError } = await supabase.from('content_plan_slots').insert(slotsToInsert)
    if (slotsError) throw new Error(slotsError.message)
  }

  await supabase
    .from('content_plans')
    .update({
      status: 'planned',
      strategy_summary: parsed.strategy_summary,
      content_pillars: pillars,
      posting_insights: postingInsights,
    })
    .eq('id', planRow.id)

  return { planId: planRow.id }
}

/** Trim or fix slots so hard platform limits are respected after AI generation */
function normalizeSlotsForPlaybooks(
  slots: z.infer<typeof PlanSlotSchema>[],
  channels: Channel[],
  startDate: string,
  endDate: string,
): z.infer<typeof PlanSlotSchema>[] {
  const start = parseISO(startDate)
  const end = parseISO(endDate)
  const validDates = new Set(
    eachDayOfInterval({ start, end }).map(d => format(d, 'yyyy-MM-dd')),
  )

  let filtered = slots
    .filter(s => channels.includes(s.channel as Channel))
    .map(s => ({
      ...s,
      scheduled_date: validDates.has(s.scheduled_date)
        ? s.scheduled_date
        : startDate,
      // Enforce X format ↔ length pairing
      ...(s.channel === 'x' && s.post_type.toLowerCase() === 'thread'
        ? { post_length: 'long' as const }
        : {}),
      ...(s.channel === 'x' && s.post_type.toLowerCase() === 'single'
        ? { post_length: 'short' as const }
        : {}),
    }))

  // LinkedIn: max 3 per rolling 7 days, max 1 per day
  filtered = capLinkedInSlots(filtered, start, end)

  // X: ensure at least some threads if we have enough X slots
  filtered = ensureXFormatMix(filtered)

  return filtered
}

function capLinkedInSlots(
  slots: z.infer<typeof PlanSlotSchema>[],
  start: Date,
  end: Date,
): z.infer<typeof PlanSlotSchema>[] {
  const linkedin = slots.filter(s => s.channel === 'linkedin')
  const other = slots.filter(s => s.channel !== 'linkedin')

  const byDate = new Map<string, z.infer<typeof PlanSlotSchema>>()
  for (const s of linkedin.sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))) {
    if (!byDate.has(s.scheduled_date)) byDate.set(s.scheduled_date, s)
  }

  const onePerDay = [...byDate.values()]
  const capped: z.infer<typeof PlanSlotSchema>[] = []
  const days = eachDayOfInterval({ start, end })

  for (let i = 0; i < days.length; i += 7) {
    const weekStart = days[i]
    const weekEnd = addDays(weekStart, 6)
    const weekSlots = onePerDay.filter(s => {
      const d = parseISO(s.scheduled_date)
      return d >= weekStart && d <= weekEnd
    })
    capped.push(...weekSlots.slice(0, 3))
  }

  return [...other, ...capped]
}

function ensureXFormatMix(slots: z.infer<typeof PlanSlotSchema>[]): z.infer<typeof PlanSlotSchema>[] {
  const xSlots = slots.filter(s => s.channel === 'x')
  if (xSlots.length < 4) return slots

  const threadCount = xSlots.filter(s => isXThreadType(s.post_type)).length
  const targetThreads = Math.max(1, Math.round(xSlots.length * 0.35))

  if (threadCount >= targetThreads) return slots

  const nonThreads = xSlots.filter(s => !isXThreadType(s.post_type))
  const toConvert = nonThreads.slice(0, targetThreads - threadCount)

  return slots.map(s => {
    if (!toConvert.includes(s)) return s
    return {
      ...s,
      post_type: 'thread',
      post_length: 'long' as const,
      notes: [s.notes, 'Format: thread (3–7 tweets)'].filter(Boolean).join(' · '),
    }
  })
}

function isXThreadType(postType: string): boolean {
  const t = postType.toLowerCase()
  return t === 'thread' || t.includes('thread')
}

/** Normalize AI dates that fall outside range */
export function clampPlanDates(startDate: string, endDate: string): { start: string; end: string } {
  const start = parseISO(startDate)
  const end = parseISO(endDate)
  if (end < start) {
    return { start: startDate, end: format(addDays(start, 6), 'yyyy-MM-dd') }
  }
  return { start: startDate, end: endDate }
}
