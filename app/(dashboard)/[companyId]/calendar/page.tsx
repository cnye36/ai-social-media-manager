import { CalendarView } from '@/components/calendar/CalendarView'

interface Props {
  params: Promise<{ companyId: string }>
}

export default async function CalendarPage({ params }: Props) {
  const { companyId } = await params
  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Calendar</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Scheduled posts appear on the calendar. Click a day to see details or reschedule.
          Unscheduled drafts are listed in the side panel.
        </p>
      </div>
      <CalendarView companyId={companyId} />
    </div>
  )
}
