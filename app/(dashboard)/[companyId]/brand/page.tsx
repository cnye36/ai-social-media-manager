import { createClient } from '@/lib/supabase/server'
import { BrandForm } from '@/components/brand/BrandForm'

interface Props {
  params: Promise<{ companyId: string }>
}

export default async function BrandPage({ params }: Props) {
  const { companyId } = await params
  const supabase = await createClient()

  const { data: brandProfile } = await supabase
    .from('brand_profiles')
    .select('*')
    .eq('company_id', companyId)
    .single()

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Brand Profile</h1>
        <p className="text-zinc-400 mt-1 text-sm">Define your voice, tone, and style so every AI post feels on-brand</p>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <BrandForm companyId={companyId} initialData={brandProfile} />
      </div>
    </div>
  )
}
