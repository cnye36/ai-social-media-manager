import type { SupabaseClient } from '@supabase/supabase-js'
import { generatePost } from '@/agents/index'
import { isThreadSlot } from '@/lib/content-planning/channel-playbook'
import type { ContentPlanSlot } from '@/types/content-planning'
import type { Channel } from '@/types/database'

export interface WriteBatchResult {
  written: { slotId: string; postId: string }[]
  errors: { slotId: string; message: string }[]
}

export async function writePlanSlots(
  supabase: SupabaseClient,
  planId: string,
  companyId: string,
  slotIds?: string[],
  additionalContext?: string,
): Promise<WriteBatchResult> {
  let query = supabase
    .from('content_plan_slots')
    .select('*')
    .eq('plan_id', planId)
    .eq('company_id', companyId)
    .eq('status', 'planned')
    .order('scheduled_for', { ascending: true })

  if (slotIds?.length) {
    query = query.in('id', slotIds)
  }

  const { data: slots, error } = await query
  if (error) throw new Error(error.message)
  if (!slots?.length) return { written: [], errors: [] }

  await supabase.from('content_plans').update({ status: 'writing' }).eq('id', planId)

  const written: WriteBatchResult['written'] = []
  const errors: WriteBatchResult['errors'] = []

  for (const slot of slots as ContentPlanSlot[]) {
    await supabase.from('content_plan_slots').update({ status: 'writing' }).eq('id', slot.id)

    try {
      const topic = [
        slot.topic,
        slot.pillar && `Content pillar: ${slot.pillar}`,
        slot.post_type && `Post type: ${slot.post_type}`,
        slot.notes,
        additionalContext,
      ].filter(Boolean).join('\n')

      const useThread = isThreadSlot(
        slot.channel as Channel,
        slot.post_type,
        slot.post_length,
      )

      const generated = await generatePost({
        companyId,
        channel: slot.channel as Channel,
        topic: useThread ? `${topic}\n\nWrite as a thread (3–7 tweets).` : topic,
        contentGoal: slot.content_goal,
        postLength: useThread ? 'long' : slot.post_length,
        additionalContext: additionalContext,
        threadMode: useThread,
      })

      const generationParams = {
        plan_id: planId,
        slot_id: slot.id,
        topic: slot.topic,
        post_type: slot.post_type,
        pillar: slot.pillar,
        image_prompt: generated.imagePrompt,
      }

      const { data: post, error: insertError } = await supabase
        .from('posts')
        .insert({
          company_id: companyId,
          channel: slot.channel,
          status: 'draft',
          content: generated.content,
          scheduled_for: slot.scheduled_for,
          content_variants: generated.contentVariants ?? {},
          media_items: [],
          ai_generated: true,
          generation_params: generationParams,
        })
        .select('id')
        .single()

      if (insertError || !post) throw new Error(insertError?.message ?? 'Insert failed')

      await supabase
        .from('content_plan_slots')
        .update({ status: 'written', post_id: post.id })
        .eq('id', slot.id)

      written.push({ slotId: slot.id, postId: post.id })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      await supabase.from('content_plan_slots').update({ status: 'planned' }).eq('id', slot.id)
      errors.push({ slotId: slot.id, message })
    }
  }

  const { count: remaining } = await supabase
    .from('content_plan_slots')
    .select('id', { count: 'exact', head: true })
    .eq('plan_id', planId)
    .eq('status', 'planned')

  await supabase
    .from('content_plans')
    .update({ status: (remaining ?? 0) === 0 ? 'ready' : 'planned' })
    .eq('id', planId)

  return { written, errors }
}
