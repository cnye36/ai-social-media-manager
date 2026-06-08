'use client'

import { Pencil, Copy, Check, Trash2, Loader2, CalendarClock, CircleCheck, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { format, formatDistanceToNow } from 'date-fns'
import { postBodyForPublish } from '@/lib/generate/image-prompt'
import type { Post, PostStatus } from '@/types/database'

const STATUS_STYLES: Record<PostStatus, string> = {
  draft:     'text-zinc-400 bg-zinc-800',
  scheduled: 'text-yellow-400 bg-yellow-900/30',
  published: 'text-emerald-400 bg-emerald-900/30',
  archived:  'text-zinc-600 bg-zinc-900',
}

const STATUS_ICONS: Record<PostStatus, React.ReactNode> = {
  draft:     <Pencil className="w-3 h-3" />,
  scheduled: <CalendarClock className="w-3 h-3" />,
  published: <CircleCheck className="w-3 h-3" />,
  archived:  <Clock className="w-3 h-3" />,
}

interface PostGridViewProps {
  posts: Post[]
  copiedId: string | null
  deletingId: string | null
  onEdit: (post: Post) => void
  onCopy: (post: Post) => void
  onDelete: (postId: string) => void
  renderBadge?: (post: Post) => React.ReactNode
}

export function PostGridView({ posts, copiedId, deletingId, onEdit, onCopy, onDelete, renderBadge }: PostGridViewProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {posts.map(post => {
        const body = postBodyForPublish(post.content)
        const preview = body.length > 120 ? body.slice(0, 120).trimEnd() + '…' : body
        const dateLabel = post.published_at
          ? `Published ${formatDistanceToNow(new Date(post.published_at), { addSuffix: true })}`
          : post.scheduled_for
            ? `Scheduled ${format(new Date(post.scheduled_for), 'MMM d, h:mm a')}`
            : `Created ${formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}`

        return (
          <div
            key={post.id}
            className="group flex flex-col bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors"
          >
            {/* Top row: status + actions */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={cn(
                  'flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded capitalize',
                  STATUS_STYLES[post.status]
                )}>
                  {STATUS_ICONS[post.status]}
                  {post.status}
                </span>
                {renderBadge?.(post)}
              </div>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => onEdit(post)}
                  title="Edit"
                  className="p-1.5 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onCopy(post)}
                  title="Copy"
                  className="p-1.5 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  {copiedId === post.id
                    ? <Check className="w-3.5 h-3.5 text-green-400" />
                    : <Copy className="w-3.5 h-3.5" />
                  }
                </button>
                <button
                  onClick={() => onDelete(post.id)}
                  disabled={deletingId === post.id}
                  title="Delete"
                  className="p-1.5 rounded text-zinc-600 hover:text-red-400 hover:bg-red-900/20 transition-colors disabled:opacity-40"
                >
                  {deletingId === post.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Trash2 className="w-3.5 h-3.5" />
                  }
                </button>
              </div>
            </div>

            {/* Post preview */}
            <p className="text-sm text-zinc-400 leading-relaxed flex-1 line-clamp-4">{preview}</p>

            {/* Date */}
            <p className="text-[10px] text-zinc-600 mt-3">{dateLabel}</p>
          </div>
        )
      })}
    </div>
  )
}
