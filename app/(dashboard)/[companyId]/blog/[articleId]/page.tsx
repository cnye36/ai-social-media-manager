import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ArticleEditorClient } from '@/components/blog/ArticleEditorClient'

interface Props {
  params: Promise<{ companyId: string; articleId: string }>
  searchParams: Promise<{ autoGenerate?: string }>
}

export default async function ArticlePage({ params, searchParams }: Props) {
  const { companyId, articleId } = await params
  const { autoGenerate } = await searchParams
  const supabase = await createClient()

  const [{ data: article }, { data: sites }] = await Promise.all([
    supabase.from('articles').select('*').eq('id', articleId).eq('company_id', companyId).single(),
    supabase.from('blog_sites').select('*').eq('company_id', companyId).order('created_at'),
  ])

  if (!article) notFound()

  return (
    <ArticleEditorClient
      article={article}
      companyId={companyId}
      sites={sites ?? []}
      autoGenerate={autoGenerate === 'true'}
    />
  )
}
