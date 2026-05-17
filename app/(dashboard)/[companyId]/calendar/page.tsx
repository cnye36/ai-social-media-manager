import { createClient } from '@/lib/supabase/server'
import { ContentCalendar } from '@/components/calendar/ContentCalendar'
import { startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns'

interface Props {
  params: Promise<{ companyId: string }>
}

export default async function CalendarPage({ params }: Props) {
  const { companyId } = await params
  const supabase = await createClient()

  // Load 3 months of posts (prev, current, next) so navigation feels instant
  const rangeStart = startOfMonth(subMonths(new Date(), 1)).toISOString()
  const rangeEnd = endOfMonth(addMonths(new Date(), 1)).toISOString()

  const { data: posts } = await supabase
    .from('posts')
    .select('*')
    .eq('company_id', companyId)
    .not('scheduled_for', 'is', null)
    .gte('scheduled_for', rangeStart)
    .lte('scheduled_for', rangeEnd)
    .order('scheduled_for')

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Content Calendar</h1>
        <p className="text-zinc-400 mt-1 text-sm">
          Click any post to edit, reschedule, or update its status
        </p>
      </div>

      <ContentCalendar
        posts={posts ?? []}
        companyId={companyId}
        generateHref={`/${companyId}/generate`}
      />
    </div>
  )
}
