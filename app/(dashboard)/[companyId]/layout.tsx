import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/Sidebar'
import { publishDueContent } from '@/lib/publishing/publish-due'

interface Props {
  children: React.ReactNode
  params: Promise<{ companyId: string }>
}

export default async function DashboardLayout({ children, params }: Props) {
  const { companyId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  publishDueContent(supabase, { companyId }).catch(() => {})

  const { data: companies } = await supabase
    .from('companies')
    .select('*')
    .order('created_at')

  if (!companies || companies.length === 0) {
    redirect('/companies/new')
  }

  const company = companies.find(c => c.id === companyId)
  if (!company) redirect(`/${companies[0].id}`)

  return (
    <div className="flex h-screen overflow-hidden bg-surface-0">
      <Sidebar companies={companies} currentCompanyId={companyId} />
      <main className="flex-1 min-w-0 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
