import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { SettingsClient } from './SettingsClient'
import { notFound } from 'next/navigation'

interface Props {
  params: Promise<{ companyId: string }>
}

export default async function SettingsPage({ params }: Props) {
  const { companyId } = await params
  const supabase = await createClient()

  const [companyRes, brandRes, knowledgeRes, blogSitesRes] = await Promise.all([
    supabase.from('companies').select('*').eq('id', companyId).single(),
    supabase.from('brand_profiles').select('*').eq('company_id', companyId).single(),
    supabase
      .from('knowledge_chunks')
      .select('id, company_id, title, source_url, source_type, content, metadata, created_at', { count: 'exact' })
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('blog_sites').select('*').eq('company_id', companyId).order('created_at'),
  ])

  if (!companyRes.data) notFound()

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold text-white">Settings</h1>
        <p className="text-zinc-400 mt-1 text-sm">
          Manage your company profile, brand voice, and AI knowledge base
        </p>
      </div>

      <Suspense>
        <SettingsClient
          company={companyRes.data}
          brandProfile={brandRes.data ?? null}
          knowledgeChunks={knowledgeRes.data ?? []}
          knowledgeTotal={knowledgeRes.count ?? 0}
          blogSites={blogSitesRes.data ?? []}
        />
      </Suspense>
    </div>
  )
}
