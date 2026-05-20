import { createClient } from '@/lib/supabase/server'
import { PlanDetailClient } from '@/components/planner/PlanDetailClient'
import { notFound } from 'next/navigation'
import type { ContentPlan, ContentPlanSlot } from '@/types/content-planning'

interface Props {
  params: Promise<{ companyId: string; planId: string }>
}

export default async function PlanDetailPage({ params }: Props) {
  const { companyId, planId } = await params
  const supabase = await createClient()

  const { data: plan } = await supabase
    .from('content_plans')
    .select('*, content_plan_slots(*)')
    .eq('id', planId)
    .eq('company_id', companyId)
    .single()

  if (!plan) notFound()

  const slots = ((plan.content_plan_slots ?? []) as ContentPlanSlot[]).sort(
    (a, b) => new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime(),
  )

  const { content_plan_slots: _, ...planData } = plan

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <PlanDetailClient
        companyId={companyId}
        initialPlan={{ ...(planData as ContentPlan), slots }}
      />
    </div>
  )
}
