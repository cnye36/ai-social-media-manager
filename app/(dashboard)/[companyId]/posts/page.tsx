import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PostsTable } from '@/components/posts/PostsTable'
import { publishDueContent } from '@/lib/publishing/publish-due'

interface Props {
  params: Promise<{ companyId: string }>
}

export default async function PostsPage({ params }: Props) {
  const { companyId } = await params
  const supabase = await createClient()

  await publishDueContent(supabase, { companyId }).catch(() => {})

  const { data: posts } = await supabase
    .from('posts')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Posts</h1>
          <p className="text-zinc-400 mt-1 text-sm">All your drafted, scheduled, and published content</p>
        </div>
        <Link
          href={`/${companyId}/generate`}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-500 transition-colors"
        >
          <Sparkles className="w-4 h-4" />
          Generate new
        </Link>
      </div>

      <PostsTable posts={posts ?? []} companyId={companyId} />
    </div>
  )
}
