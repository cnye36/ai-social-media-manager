import { createClient } from '@/lib/supabase/server'
import { ContentCalendar } from '@/components/calendar/ContentCalendar'
import { calendarSortKey, filterPostsForCalendar } from '@/lib/calendar-items'
import { calendarDisplayAt } from '@/lib/content-status'
import { publishDueContent } from '@/lib/publishing/publish-due'
import { startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns'

interface Props {
  params: Promise<{ companyId: string }>
}

export default async function CalendarPage({ params }: Props) {
  const { companyId } = await params
  const supabase = await createClient()

  const rangeStart = startOfMonth(subMonths(new Date(), 1))
  const rangeEnd = endOfMonth(addMonths(new Date(), 1))

  // Run publish check in parallel with data fetches — calendar shows both
  // scheduled and published, so stale status within the same render is fine.
  const [, [{ data: rawPosts }, { data: rawArticles }]] = await Promise.all([
    publishDueContent(supabase, { companyId }).catch(() => {}),
    Promise.all([
      supabase
        .from('posts')
        .select('*')
        .eq('company_id', companyId)
        .in('status', ['scheduled', 'published']),
      supabase
        .from('articles')
        .select('*')
        .eq('company_id', companyId)
        .in('status', ['scheduled', 'published']),
    ]),
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
        generateHref={`/${companyId}/generate`}
      />
    </div>
  )
}
