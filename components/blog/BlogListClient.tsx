'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Plus, Loader2, CalendarClock, FileText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BlogIdeaSpark } from './BlogIdeaSpark'
import { ArticleGridView } from './ArticleGridView'
import { ArticlesMiniCalendar } from './ArticlesMiniCalendar'
import { PostViewToggle, type PostView } from '@/components/posts/PostViewToggle'
import { cn } from '@/lib/utils'
import { sortArticlesNewestFirst } from '@/lib/blog/article-sort'
import type { Article, ArticleStatus } from '@/types/database'
import type { ArticleFormat } from '@/types/agents'
import type { BlogIdea } from '@/app/api/blog/ideas/route'

const STATUS_FILTERS: { value: ArticleStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'published', label: 'Published' },
]

interface BlogListClientProps {
  articles: Article[]
  companyId: string
}

export function BlogListClient({ articles: initialArticles, companyId }: BlogListClientProps) {
  const router = useRouter()
  const [articles, setArticles] = useState<Article[]>(initialArticles)
  const [statusFilter, setStatusFilter] = useState<ArticleStatus | 'all'>('all')
  const [view, setView] = useState<PostView>('list')
  const [creating, setCreating] = useState(false)
  const [articleFormat, setArticleFormat] = useState<ArticleFormat>('blog_post')

  const filtered = sortArticlesNewestFirst(
    statusFilter === 'all'
      ? articles
      : articles.filter(a => a.status === statusFilter),
  )

  async function createArticle(title = '') {
    setCreating(true)
    try {
      const res = await fetch('/api/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: companyId, title }),
      })
      if (!res.ok) return
      const article: Article = await res.json()
      setArticles(prev => [article, ...prev])
      router.push(`/${companyId}/blog/${article.id}`)
    } finally {
      setCreating(false)
    }
  }

  async function handleIdea(idea: BlogIdea) {
    setCreating(true)
    try {
      const res = await fetch('/api/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: companyId, title: idea.title }),
      })
      if (!res.ok) return
      const article: Article = await res.json()
      router.push(`/${companyId}/blog/${article.id}?autoGenerate=true&format=${articleFormat}`)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-1.5 bg-zinc-800/50 rounded-lg p-1">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={cn(
                'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                statusFilter === f.value
                  ? 'bg-zinc-700 text-white'
                  : 'text-zinc-500 hover:text-white'
              )}
            >
              {f.label}
              <span className="ml-1.5 text-zinc-600">
                {f.value === 'all' ? articles.length : articles.filter(a => a.status === f.value).length}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <PostViewToggle view={view} onChange={setView} />
          <Button
            size="sm"
            onClick={() => createArticle()}
            disabled={creating}
            className="gap-1.5"
          >
            {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            New article
          </Button>
        </div>
      </div>

      {/* Idea generator */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
        <p className="text-xs font-medium text-zinc-400 mb-3 flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5" />
          Blog ideas (aware of what you&apos;ve written)
        </p>
        <BlogIdeaSpark
          companyId={companyId}
          articleFormat={articleFormat}
          onFormatChange={setArticleFormat}
          onGenerate={handleIdea}
          disabled={creating}
        />
      </div>

      {/* Article list */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 py-16 text-center">
          <FileText className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
          <p className="text-sm text-zinc-500">
            {statusFilter === 'all' ? 'No articles yet.' : `No ${statusFilter} articles.`}
          </p>
          <p className="text-xs text-zinc-600 mt-1">
            Generate an idea above or click &ldquo;New article&rdquo; to start writing.
          </p>
        </div>
      ) : view === 'grid' ? (
        <ArticleGridView articles={filtered} companyId={companyId} />
      ) : view === 'calendar' ? (
        <ArticlesMiniCalendar articles={filtered} companyId={companyId} />
      ) : (
        <div className="rounded-xl border border-zinc-800 overflow-hidden divide-y divide-zinc-800">
          {filtered.map(article => (
            <Link
              key={article.id}
              href={`/${companyId}/blog/${article.id}`}
              className="flex items-start gap-4 px-5 py-4 hover:bg-zinc-800/40 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <p className={cn(
                  'text-sm font-medium truncate transition-colors group-hover:text-white',
                  article.title ? 'text-zinc-200' : 'text-zinc-600 italic'
                )}>
                  {article.title || 'Untitled article'}
                </p>
                {article.excerpt && (
                  <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{article.excerpt}</p>
                )}
                {article.tags.length > 0 && (
                  <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                    {article.tags.slice(0, 4).map(tag => (
                      <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {(article.status === 'published' ? article.published_at : article.scheduled_for) && (
                  <span className="flex items-center gap-1 text-xs text-zinc-500">
                    <CalendarClock className="w-3 h-3" />
                    {format(
                      new Date(
                        (article.status === 'published'
                          ? article.published_at
                          : article.scheduled_for)!,
                      ),
                      'MMM d, h:mm a',
                    )}
                  </span>
                )}
                <Badge variant={article.status as ArticleStatus}>{article.status}</Badge>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
