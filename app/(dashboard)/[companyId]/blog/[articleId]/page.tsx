import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ArticleEditorClient } from '@/components/blog/ArticleEditorClient'
import { publishDueContent } from '@/lib/publishing/publish-due'

interface Props {
  params: Promise<{ companyId: string; articleId: string }>
  searchParams: Promise<{ autoGenerate?: string }>
}

export default async function ArticlePage({ params, searchParams }: Props) {
  const { companyId, articleId } = await params
  const { autoGenerate } = await searchParams
  const supabase = await createClient()

  await publishDueContent(supabase, { companyId }).catch(() => {})

  const [{ data: article }, { data: sites }, { data: brand }] = await Promise.all([
    supabase.from('articles').select('*').eq('id', articleId).eq('company_id', companyId).single(),
    supabase.from('blog_sites').select('*').eq('company_id', companyId).order('created_at'),
    supabase.from('brand_profiles').select('color_palette').eq('company_id', companyId).maybeSingle(),
  ])

  if (!article) notFound()

  const palette = brand?.color_palette as Record<string, string> | null
  const brandColors = palette?.primary
    ? { primary: palette.primary, accent: palette.accent ?? undefined }
    : undefined

  return (
    <ArticleEditorClient
      article={article}
      companyId={companyId}
      sites={sites ?? []}
      brandColors={brandColors}
      autoGenerate={autoGenerate === 'true'}
    />
  )
}
