import { createClient } from '@/lib/supabase/server'
import { PlannerListClient } from '@/components/planner/PlannerListClient'
import type { ContentPlan } from '@/types/content-planning'

interface Props {
  params: Promise<{ companyId: string }>
}

export default async function PlannerPage({ params }: Props) {
  const { companyId } = await params
  const supabase = await createClient()

  const { data: plans } = await supabase
    .from('content_plans')
    .select('*')
    .eq('company_id', companyId)
    .order('start_date', { ascending: false })

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <PlannerListClient
        companyId={companyId}
        initialPlans={(plans ?? []) as ContentPlan[]}
      />
    </div>
  )
}
