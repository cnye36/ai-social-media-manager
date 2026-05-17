import { createClient } from '@/lib/supabase/server'
import { ScrapeForm } from '@/components/knowledge/ScrapeForm'
import { ManualEntryForm } from '@/components/knowledge/ManualEntryForm'
import { KnowledgeList } from '@/components/knowledge/KnowledgeList'

interface Props {
  params: Promise<{ companyId: string }>
}

export default async function KnowledgePage({ params }: Props) {
  const { companyId } = await params
  const supabase = await createClient()

  const { data, count } = await supabase
    .from('knowledge_chunks')
    .select('id, title, source_url, source_type, content, created_at', { count: 'exact' })
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(200)

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Knowledge Base</h1>
        <p className="text-zinc-400 mt-1 text-sm">
          Feed your AI agents company information — the more you add, the better the posts
        </p>
      </div>

      {/* Scrape website */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <div className="mb-5">
          <h2 className="font-semibold text-white">Scrape website</h2>
          <p className="text-zinc-400 text-sm mt-0.5">
            Automatically extract content from your website pages
          </p>
        </div>
        <ScrapeForm companyId={companyId} />
      </div>

      {/* Manual entry */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <div className="mb-5">
          <h2 className="font-semibold text-white">Add manually</h2>
          <p className="text-zinc-400 text-sm mt-0.5">
            Paste product descriptions, bios, FAQs, talking points, or anything else
          </p>
        </div>
        <ManualEntryForm companyId={companyId} />
      </div>

      {/* Knowledge chunks list */}
      <div>
        <h2 className="font-semibold text-white mb-4">Indexed knowledge</h2>
        <KnowledgeList
          initialChunks={data ?? []}
          initialTotal={count ?? 0}
          companyId={companyId}
        />
      </div>
    </div>
  )
}
