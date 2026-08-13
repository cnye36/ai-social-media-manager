import OpenAI from 'openai'
import { z } from 'zod'
import { zodResponseFormat } from 'openai/helpers/zod'
import { format } from 'date-fns'
import type { SupabaseClient } from '@supabase/supabase-js'
import { retrieve } from '@/lib/rag/retrieve'
import { getChannelSchedules, listScheduleSlotsInRange } from '@/lib/scheduling/next-slot'
import { buildBrandContext, summarizePastPosts } from './brand-context'
import {
  buildPlaybookPromptSection,
  getPlaybook,
  selectCalendarSlots,
  slotIsInRange,
  type CalendarSlot,
} from './channel-playbook'
import { analyzePostingInsights } from './posting-insights'
import type { Channel, Company, Post } from '@/types/database'
import type { ContentPillar, CreateContentPlanRequest } from '@/types/content-planning'
import type { ContentGoal, PostLength } from '@/types/agents'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const PlanSlotSchema = z.object({
  slot_index: z.number().int().describe('Index of the predetermined calendar slot to fill'),
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

  if (endDate < startDate) {
    throw new Error('End date must be on or after the start date')
  }

  const now = new Date()

  const [{ data: company }, { data: brand }, { data: pastPosts }, { data: existingInRange }] =
    await Promise.all([
      supabase.from('companies').select('*').eq('id', companyId).single(),
      supabase.from('brand_profiles').select('*').eq('company_id', companyId).single(),
      supabase
        .from('posts')
        .select('*')
        .eq('company_id', companyId)
        .in('status', ['scheduled', 'published'])
        .order('scheduled_for', { ascending: false, nullsFirst: false })
        .limit(60),
      supabase
        .from('posts')
        .select('channel, scheduled_for')
        .eq('company_id', companyId)
        .in('status', ['scheduled'])
        .gte('scheduled_for', `${startDate}T00:00:00.000Z`)
        .lte('scheduled_for', `${endDate}T23:59:59.999Z`),
    ])

  if (!company) throw new Error('Company not found')

  const historicalPosts = (pastPosts ?? []) as Post[]
  const postingInsights = analyzePostingInsights(historicalPosts, channels)
  const brandContext = buildBrandContext(company as Company, brand)
  const pastSummary = summarizePastPosts(historicalPosts)

  const existingScheduled: Partial<Record<string, Date[]>> = {}
  for (const p of existingInRange ?? []) {
    if (!p.scheduled_for) continue
    const ch = p.channel as string
    const list = existingScheduled[ch] ?? []
    list.push(new Date(p.scheduled_for))
    existingScheduled[ch] = list
  }

  const scheduleSlots: Partial<Record<Channel, CalendarSlot[]>> = {}
  for (const ch of channels) {
    const entries = await getChannelSchedules(supabase, companyId, ch).catch(() => [])
    if (!entries.length) continue
    scheduleSlots[ch] = listScheduleSlotsInRange(entries, startDate, endDate, now)
      .map(s => ({ channel: ch, scheduledFor: s.utc, calendarDate: s.calendarDate }))
  }

  const calendarSlots = selectCalendarSlots({
    channels,
    startDate,
    endDate,
    scheduleSlots,
    insights: postingInsights,
    existingScheduled,
    now,
  }).filter(s => slotIsInRange(s, startDate, endDate) && s.scheduledFor > now)

  if (calendarSlots.length === 0) {
    throw new Error(
      'No posting time slots fall within this date range for the selected channels. Widen the range or add posting times in Settings.',
    )
  }

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

  const targetBreakdown = channels
    .map(ch => `${getPlaybook(ch).label}: ${calendarSlots.filter(s => s.channel === ch).length} slots`)
    .join(', ')

  const slotList = calendarSlots
    .map((s, i) =>
      `${i}. ${getPlaybook(s.channel).label} · ${s.calendarDate} · ${format(s.scheduledFor, "HH:mm 'UTC'")}`,
    )
    .join('\n')

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

POSTING INSIGHTS (already applied to the slot times — do not invent new times):
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
- Date range: ${startDate} to ${endDate}
- Channels: ${channels.join(', ')}
- Predetermined slots: ${targetBreakdown} (${calendarSlots.length} total)
- Fill EVERY slot listed below. Use slot_index to match. Do NOT add extra slots, dates, or times.
- Do NOT repeat the same topic within 5 days on the same channel
- Topics are brief briefs for writers (under 120 chars), not finished copy
- Assign post_type and pillar so the team can recycle this plan monthly

X-SPECIFIC: You MUST include both "single" and "thread" post_types. Singles use post_length "short"; threads use post_length "long".`

  const completion = await openai.chat.completions.parse({
    model: 'gpt-5.4',
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Create the content plan "${name}" by filling these ${calendarSlots.length} slots from ${startDate} to ${endDate}. Return one object per slot_index (0–${calendarSlots.length - 1}).\n\n${slotList}`,
      },
    ],
    response_format: zodResponseFormat(PlanOutputSchema, 'content_plan'),
    temperature: 0.5,
  })

  const parsed = completion.choices[0].message.parsed
  if (!parsed) throw new Error('Failed to parse content plan from AI')

  const pillars = parsed.content_pillars as ContentPillar[]
  const filled = matchSlotsToCalendar(parsed.slots, calendarSlots, startDate, endDate, now)
  const mixed = ensureXFormatMix(filled)

  const slotsToInsert = mixed.map(({ calendar, content }, index) => ({
    plan_id: planRow.id,
    company_id: companyId,
    scheduled_for: calendar.scheduledFor.toISOString(),
    channel: calendar.channel,
    post_type: content.post_type,
    pillar: content.pillar,
    topic: content.topic,
    content_goal: content.content_goal as ContentGoal,
    post_length: content.post_length as PostLength,
    notes: content.notes,
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

interface FilledSlot {
  calendar: CalendarSlot
  content: z.infer<typeof PlanSlotSchema>
}

function matchSlotsToCalendar(
  slots: z.infer<typeof PlanSlotSchema>[],
  calendarSlots: CalendarSlot[],
  startDate: string,
  endDate: string,
  now: Date,
): FilledSlot[] {
  const used = new Set<number>()
  const filled: FilledSlot[] = []

  for (const content of slots) {
    if (content.slot_index < 0 || content.slot_index >= calendarSlots.length) continue
    if (used.has(content.slot_index)) continue
    const calendar = calendarSlots[content.slot_index]
    if (!slotIsInRange(calendar, startDate, endDate)) continue
    if (calendar.scheduledFor <= now) continue
    used.add(content.slot_index)
    filled.push({
      calendar,
      content: {
        ...content,
        ...(calendar.channel === 'x' && content.post_type.toLowerCase() === 'thread'
          ? { post_length: 'long' as const }
          : {}),
        ...(calendar.channel === 'x' && content.post_type.toLowerCase() === 'single'
          ? { post_length: 'short' as const }
          : {}),
      },
    })
  }

  return filled.sort(
    (a, b) => a.calendar.scheduledFor.getTime() - b.calendar.scheduledFor.getTime(),
  )
}

function ensureXFormatMix(slots: FilledSlot[]): FilledSlot[] {
  const xSlots = slots.filter(s => s.calendar.channel === 'x')
  if (xSlots.length < 4) return slots

  const threadCount = xSlots.filter(s => isXThreadType(s.content.post_type)).length
  const targetThreads = Math.max(1, Math.round(xSlots.length * 0.35))

  if (threadCount >= targetThreads) return slots

  const nonThreads = xSlots.filter(s => !isXThreadType(s.content.post_type))
  const toConvert = new Set(nonThreads.slice(0, targetThreads - threadCount))

  return slots.map(s => {
    if (!toConvert.has(s)) return s
    return {
      calendar: s.calendar,
      content: {
        ...s.content,
        post_type: 'thread',
        post_length: 'long' as const,
        notes: [s.content.notes, 'Format: thread (3–7 tweets)'].filter(Boolean).join(' · '),
      },
    }
  })
}

function isXThreadType(postType: string): boolean {
  const t = postType.toLowerCase()
  return t === 'thread' || t.includes('thread')
}

/** Normalize inverted ranges without inventing a week/month preset. */
export function clampPlanDates(startDate: string, endDate: string): { start: string; end: string } {
  if (endDate < startDate) return { start: startDate, end: startDate }
  return { start: startDate, end: endDate }
}
