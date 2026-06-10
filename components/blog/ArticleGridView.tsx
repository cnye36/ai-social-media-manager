'use client'

import Link from 'next/link'
import { Pencil, CalendarClock, CircleCheck, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { format, formatDistanceToNow } from 'date-fns'
import type { Article, ArticleStatus } from '@/types/database'

const STATUS_STYLES: Record<ArticleStatus, string> = {
  draft: 'text-zinc-400 bg-zinc-800',
  scheduled: 'text-yellow-400 bg-yellow-900/30',
  published: 'text-emerald-400 bg-emerald-900/30',
  archived: 'text-zinc-600 bg-zinc-900',
}

const STATUS_ICONS: Record<ArticleStatus, React.ReactNode> = {
  draft: <Pencil className="w-3 h-3" />,
  scheduled: <CalendarClock className="w-3 h-3" />,
  published: <CircleCheck className="w-3 h-3" />,
  archived: <Clock className="w-3 h-3" />,
}

interface ArticleGridViewProps {
  articles: Article[]
  companyId: string
}

export function ArticleGridView({ articles, companyId }: ArticleGridViewProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {articles.map(article => {
        const preview = article.excerpt
          ?? (article.title ? null : 'Start writing your article…')
        const dateLabel = article.published_at
          ? `Published ${formatDistanceToNow(new Date(article.published_at), { addSuffix: true })}`
          : article.scheduled_for
            ? `Scheduled ${format(new Date(article.scheduled_for), 'MMM d, h:mm a')}`
            : `Updated ${formatDistanceToNow(new Date(article.updated_at), { addSuffix: true })}`

        return (
          <Link
            key={article.id}
            href={`/${companyId}/blog/${article.id}`}
            className="group flex flex-col bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors"
          >
            <div className="flex items-center justify-between mb-3">
              <span className={cn(
                'flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded capitalize',
                STATUS_STYLES[article.status],
              )}>
                {STATUS_ICONS[article.status]}
                {article.status}
              </span>
            </div>

            <p className={cn(
              'text-sm font-medium leading-snug line-clamp-2 group-hover:text-white transition-colors',
              article.title ? 'text-zinc-200' : 'text-zinc-600 italic',
            )}>
              {article.title || 'Untitled article'}
            </p>

            {preview && (
              <p className="text-sm text-zinc-500 leading-relaxed flex-1 line-clamp-3 mt-2">{preview}</p>
            )}

            {article.tags.length > 0 && (
              <div className="flex items-center gap-1 mt-3 flex-wrap">
                {article.tags.slice(0, 3).map(tag => (
                  <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <p className="text-[10px] text-zinc-600 mt-3">{dateLabel}</p>
          </Link>
        )
      })}
    </div>
  )
}
