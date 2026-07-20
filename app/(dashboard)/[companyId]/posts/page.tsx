import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PostsTable } from '@/components/posts/PostsTable'

const POSTS_PER_PAGE = 20

interface Props {
  params: Promise<{ companyId: string }>
  searchParams: Promise<{ page?: string }>
}

export default async function PostsPage({ params, searchParams }: Props) {
  const { companyId } = await params
  const { page: pageParam } = await searchParams
  const page = Math.max(1, Number(pageParam) || 1)
  const supabase = await createClient()

  const from = (page - 1) * POSTS_PER_PAGE
  const to = from + POSTS_PER_PAGE - 1

  const { data: posts, count } = await supabase
    .from('posts')
    .select('*', { count: 'exact' })
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .range(from, to)

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Posts</h1>
          <p className="text-zinc-400 mt-1 text-sm">All your drafted, scheduled, and published content</p>
        </div>
        <Link
          href={`/${companyId}/social`}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-500 transition-colors"
        >
          <Sparkles className="w-4 h-4" />
          Generate new
        </Link>
      </div>

      <PostsTable
        posts={posts ?? []}
        companyId={companyId}
        totalCount={count ?? undefined}
        page={page}
        pageSize={POSTS_PER_PAGE}
      />
    </div>
  )
}
