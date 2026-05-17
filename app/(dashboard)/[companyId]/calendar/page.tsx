interface Props {
  params: Promise<{ companyId: string }>
}

export default async function CalendarPage({ params }: Props) {
  const { companyId } = await params
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-2">Content Calendar</h1>
      <p className="text-zinc-400 text-sm">Coming in Phase 4 — schedule and track posts</p>
    </div>
  )
}
