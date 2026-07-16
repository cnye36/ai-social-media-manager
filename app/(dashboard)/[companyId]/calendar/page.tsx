import { createClient } from '@/lib/supabase/server'
import { ContentCalendar } from '@/components/calendar/ContentCalendar'
import { calendarSortKey, filterPostsForCalendar } from '@/lib/calendar-items'
import { calendarDisplayAt } from '@/lib/content-status'
import { startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns'

interface Props {
  params: Promise<{ companyId: string }>
}

export default async function CalendarPage({ params }: Props) {
  const { companyId } = await params
  const supabase = await createClient()

  const rangeStart = startOfMonth(subMonths(new Date(), 1))
  const rangeEnd = endOfMonth(addMonths(new Date(), 1))
  const rangeStartIso = rangeStart.toISOString()
  const rangeEndIso = rangeEnd.toISOString()

  const [{ data: rawPosts }, { data: rawArticles }] = await Promise.all([
    supabase
      .from('posts')
      .select('*')
      .eq('company_id', companyId)
      .in('status', ['scheduled', 'published'])
      // Coarse superset of filterPostsForCalendar's date logic — keeps the fetch
      // bounded to the visible window; the exact filter below still applies.
      .or(`and(published_at.gte.${rangeStartIso},published_at.lte.${rangeEndIso}),and(scheduled_for.gte.${rangeStartIso},scheduled_for.lte.${rangeEndIso})`),
    supabase
      .from('articles')
      .select('*')
      .eq('company_id', companyId)
      .in('status', ['scheduled', 'published']),
  ])

  const posts = filterPostsForCalendar(rawPosts ?? [], rangeStart, rangeEnd)
    .sort((a, b) => (calendarSortKey(a) ?? '').localeCompare(calendarSortKey(b) ?? ''))
  const articles = (rawArticles ?? [])
    .filter(a => calendarDisplayAt(a) !== null)
    .sort((a, b) => (calendarSortKey(a) ?? '').localeCompare(calendarSortKey(b) ?? ''))

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Content Calendar</h1>
        <p className="text-zinc-400 mt-1 text-sm">
          Click any post to edit, or any article to open the editor
        </p>
      </div>

      <ContentCalendar
        posts={posts}
        articles={articles}
        companyId={companyId}
        generateHref={`/${companyId}/social`}
      />
    </div>
  )
}
