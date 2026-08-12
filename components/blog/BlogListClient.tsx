'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Plus, Loader2, CalendarClock, FileText, Sparkles, BookOpen, LayoutList, Microscope } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { BlogIdeaSpark } from './BlogIdeaSpark'
import { ArticleGridView } from './ArticleGridView'
import { ArticlesMiniCalendar } from './ArticlesMiniCalendar'
import { PostViewToggle, type PostView } from '@/components/posts/PostViewToggle'
import { cn } from '@/lib/utils'
import { sortArticlesNewestFirst } from '@/lib/blog/article-sort'
import type { Article, ArticleStatus } from '@/types/database'
import type { ArticleFormat } from '@/types/agents'
import type { BlogIdea } from '@/app/api/blog/ideas/route'

const FORMAT_OPTIONS: { value: ArticleFormat; label: string; icon: React.ReactNode; description: string }[] = [
  {
    value: 'blog_post',
    label: 'Blog Post',
    icon: <BookOpen className="w-3.5 h-3.5" />,
    description: '1,500–2,000 words',
  },
  {
    value: 'listicle',
    label: 'Listicle',
    icon: <LayoutList className="w-3.5 h-3.5" />,
    description: '"X Ways to…"',
  },
  {
    value: 'deep_dive',
    label: 'Deep Dive',
    icon: <Microscope className="w-3.5 h-3.5" />,
    description: '2,000–2,500 words',
  },
]

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
  const [promptTitle, setPromptTitle] = useState('')
  const [promptBrief, setPromptBrief] = useState('')
  const [promptError, setPromptError] = useState('')

  const filtered = sortArticlesNewestFirst(
    statusFilter === 'all'
      ? articles
      : articles.filter(a => a.status === statusFilter),
  )

  async function createArticle(opts: {
    title?: string
    excerpt?: string
    autoGenerate?: boolean
  } = {}) {
    const { title = '', excerpt, autoGenerate = false } = opts
    setCreating(true)
    setPromptError('')
    try {
      const res = await fetch('/api/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          title,
          ...(excerpt ? { excerpt } : {}),
        }),
      })
      if (!res.ok) return
      const article: Article = await res.json()
      setArticles(prev => [article, ...prev])
      const params = new URLSearchParams()
      if (autoGenerate) params.set('autoGenerate', 'true')
      params.set('format', articleFormat)
      const qs = params.toString()
      router.push(`/${companyId}/blog/${article.id}${qs ? `?${qs}` : ''}`)
    } finally {
      setCreating(false)
    }
  }

  async function handleWriteFromPrompt(e: React.FormEvent) {
    e.preventDefault()
    const title = promptTitle.trim()
    const brief = promptBrief.trim()
    if (!title) {
      setPromptError('Add a title so AI knows what to write.')
      return
    }
    if (!brief) {
      setPromptError('Describe what you want written.')
      return
    }
    await createArticle({ title, excerpt: brief, autoGenerate: true })
  }

  async function handleIdea(idea: BlogIdea) {
    const excerpt = [idea.outline, idea.angle ? `Angle: ${idea.angle}` : '']
      .filter(Boolean)
      .join('\n\n')
    await createArticle({
      title: idea.title,
      excerpt,
      autoGenerate: true,
    })
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

      {/* Shared format + create flows */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 space-y-5">
        <div className="space-y-2">
          <p className="text-xs font-medium text-zinc-400">Article format</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {FORMAT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setArticleFormat(opt.value)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border',
                  articleFormat === opt.value
                    ? 'bg-violet-600/20 border-violet-500/50 text-violet-300'
                    : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
                )}
                title={opt.description}
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Write from prompt */}
        <div className="space-y-3 border-t border-zinc-800 pt-4">
          <p className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            Write from your brief
          </p>
          <form onSubmit={handleWriteFromPrompt} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="blog-prompt-title" className="text-xs text-zinc-500">Title</Label>
              <Input
                id="blog-prompt-title"
                value={promptTitle}
                onChange={e => setPromptTitle(e.target.value)}
                placeholder="e.g. How mid-market teams cut support tickets in half"
                disabled={creating}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="blog-prompt-brief" className="text-xs text-zinc-500">
                What to write
              </Label>
              <Textarea
                id="blog-prompt-brief"
                value={promptBrief}
                onChange={e => setPromptBrief(e.target.value)}
                placeholder="Audience, angle, key points, CTA, tone — whatever you want the article to cover…"
                rows={4}
                disabled={creating}
              />
            </div>
            {promptError && <p className="text-xs text-red-400">{promptError}</p>}
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={creating} className="gap-1.5">
                {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {creating ? 'Starting…' : 'Write with AI'}
              </Button>
            </div>
          </form>
        </div>

        {/* Idea generator */}
        <div className="border-t border-zinc-800 pt-4">
          <p className="text-xs font-medium text-zinc-400 mb-3 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            Or spark ideas (aware of what you&apos;ve written)
          </p>
          <BlogIdeaSpark
            companyId={companyId}
            articleFormat={articleFormat}
            onFormatChange={setArticleFormat}
            onGenerate={handleIdea}
            disabled={creating}
            hideFormat
          />
        </div>
      </div>

      {/* Article list */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 py-16 text-center">
          <FileText className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
          <p className="text-sm text-zinc-500">
            {statusFilter === 'all' ? 'No articles yet.' : `No ${statusFilter} articles.`}
          </p>
          <p className="text-xs text-zinc-600 mt-1">
            Write from a brief above, spark an idea, or click &ldquo;New article&rdquo;.
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
