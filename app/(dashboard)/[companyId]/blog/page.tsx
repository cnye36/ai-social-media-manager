import { createClient } from '@/lib/supabase/server'
import { BlogListClient } from '@/components/blog/BlogListClient'
import { sortArticlesNewestFirst } from '@/lib/blog/article-sort'
import { publishDueContent } from '@/lib/publishing/publish-due'

interface Props {
  params: Promise<{ companyId: string }>
}

export default async function BlogPage({ params }: Props) {
  const { companyId } = await params
  const supabase = await createClient()

  await publishDueContent(supabase, { companyId }).catch(() => {})

  const { data: rawArticles } = await supabase
    .from('articles')
    .select('*')
    .eq('company_id', companyId)

  const articles = sortArticlesNewestFirst(rawArticles ?? [])

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Blog</h1>
        <p className="text-zinc-400 mt-1 text-sm">
          Write, schedule, and promote your articles — then turn them into social posts
        </p>
      </div>

      <BlogListClient articles={articles} companyId={companyId} />
    </div>
  )
}
