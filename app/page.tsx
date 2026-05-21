import { redirect } from 'next/navigation'
import { HomePage } from '@/components/marketing/home-page'
import { createClient } from '@/lib/supabase/server'

export default async function RootPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return <HomePage />

  const { data: companies } = await supabase
    .from('companies')
    .select('id')
    .order('created_at')
    .limit(1)

  if (!companies || companies.length === 0) {
    redirect('/companies/new')
  }

  redirect(`/${companies[0].id}`)
}
