import { PostList } from '@/components/posts/PostList'
import Link from 'next/link'
import { Sparkles } from 'lucide-react'

interface Props {
  params: Promise<{ companyId: string }>
}

export default async function PostsPage({ params }: Props) {
  const { companyId } = await params
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Posts</h1>
          <p className="text-zinc-400 text-sm mt-1">Manage, schedule, and track all your content.</p>
        </div>
        <Link
          href={`/${companyId}/generate`}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-500 transition-colors"
        >
          <Sparkles className="w-4 h-4" />
          Generate
        </Link>
      </div>
      <PostList companyId={companyId} />
    </div>
  )
}
