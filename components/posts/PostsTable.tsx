'use client'

import { useState, useTransition } from 'react'
import { format } from 'date-fns'
import { Copy, Check, Trash2, CalendarClock, Calendar } from 'lucide-react'
import { PostEditorModal } from './PostEditorModal'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LinkedInIcon, XIcon, RedditIcon, FacebookIcon } from '@/components/ui/channel-icons'
import { cn } from '@/lib/utils'
import { isXThreadPost, xThreadTweetCount } from '@/lib/posts/x-format'
import type { Post, Channel, PostStatus } from '@/types/database'

const CHANNEL_ICONS: Record<Channel, React.ReactNode> = {
  linkedin: <LinkedInIcon className="w-3.5 h-3.5" />,
  x: <XIcon className="w-3.5 h-3.5" />,
  reddit: <RedditIcon className="w-3.5 h-3.5" />,
  facebook: <FacebookIcon className="w-3.5 h-3.5" />,
}

const STATUS_CYCLE: Record<PostStatus, PostStatus> = {
  draft: 'scheduled',
  scheduled: 'published',
  published: 'archived',
  archived: 'draft',
}

const STATUS_LABELS: Record<PostStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  published: 'Published',
  archived: 'Archived',
}

function XFormatLabel({ post }: { post: Post }) {
  const thread = isXThreadPost(post)
  const count = xThreadTweetCount(post)
  return (
    <span
      className={cn(
        'text-[10px] font-medium px-1.5 py-0.5 rounded',
        thread ? 'text-violet-400 bg-violet-950/40' : 'text-zinc-500 bg-zinc-800/60',
      )}
    >
      {thread ? `Thread${count != null ? ` · ${count}` : ''}` : 'Single'}
    </span>
  )
}

interface PostsTableProps {
  posts: Post[]
  companyId: string
}

export function PostsTable({ posts: initialPosts, companyId }: PostsTableProps) {
  const [posts, setPosts] = useState<Post[]>(initialPosts)
  const [channelFilter, setChannelFilter] = useState<Channel | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<PostStatus | 'all'>('all')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [editorPost, setEditorPost] = useState<Post | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)

  const channels: (Channel | 'all')[] = ['all', 'linkedin', 'x', 'reddit', 'facebook']
  const statuses: (PostStatus | 'all')[] = ['all', 'draft', 'scheduled', 'published', 'archived']

  const filtered = posts.filter(p => {
    if (channelFilter !== 'all' && p.channel !== channelFilter) return false
    if (statusFilter !== 'all' && p.status !== statusFilter) return false
    return true
  })

  async function handleCopy(post: Post) {
    await navigator.clipboard.writeText(post.content)
    setCopiedId(post.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  function handleStatusChange(post: Post) {
    const nextStatus = STATUS_CYCLE[post.status as PostStatus]
    startTransition(async () => {
      const res = await fetch(`/api/posts/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      if (res.ok) {
        setPosts(prev => prev.map(p => p.id === post.id ? { ...p, status: nextStatus } : p))
      }
    })
  }

  async function handleDelete(postId: string) {
    await fetch(`/api/posts/${postId}`, { method: 'DELETE' })
    setPosts(prev => prev.filter(p => p.id !== postId))
  }

  function handleUpdated(updated: Post) {
    setPosts(prev => prev.map(p => p.id === updated.id ? updated : p))
    setEditorPost(prev => prev?.id === updated.id ? updated : prev)
  }

  function handleDeleted(id: string) {
    setPosts(prev => prev.filter(p => p.id !== id))
  }

  return (
    <>
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="flex gap-2 items-center">
          <span className="text-xs text-zinc-500 uppercase tracking-wide">Channel</span>
          {channels.map(ch => (
            <button
              key={ch}
              onClick={() => setChannelFilter(ch)}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors capitalize',
                channelFilter === ch
                  ? 'bg-violet-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white'
              )}
            >
              {ch}
            </button>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-xs text-zinc-500 uppercase tracking-wide">Status</span>
          {statuses.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors capitalize',
                statusFilter === s
                  ? 'bg-violet-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white'
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Post count */}
      <p className="text-sm text-zinc-500">
        {filtered.length} post{filtered.length !== 1 ? 's' : ''}
      </p>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-zinc-500 text-sm border border-dashed border-zinc-800 rounded-xl">
          No posts match these filters
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden divide-y divide-zinc-800">
          {filtered.map(post => (
            <div key={post.id} className="px-5 py-4 flex items-start gap-4 hover:bg-zinc-800/30 transition-colors">
              {/* Channel + X format */}
              <div className="flex-shrink-0 mt-0.5 flex flex-col gap-1 items-start">
                <Badge variant={post.channel as Channel} className="gap-1.5">
                  {CHANNEL_ICONS[post.channel as Channel]}
                  {post.channel}
                </Badge>
                {post.channel === 'x' && (
                  <XFormatLabel post={post} />
                )}
              </div>

              {/* Content — click to edit */}
              <button
                className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
                onClick={() => { setEditorPost(post); setEditorOpen(true) }}
              >
                <p className="text-sm text-zinc-300 line-clamp-2 leading-relaxed">{post.content}</p>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="text-xs text-zinc-600">
                    {format(new Date(post.created_at), 'MMM d, yyyy')}
                  </span>
                  {post.scheduled_for && (
                    <span className="flex items-center gap-1 text-xs text-yellow-500">
                      <CalendarClock className="w-3 h-3" />
                      {format(new Date(post.scheduled_for), 'MMM d · h:mm a')}
                    </span>
                  )}
                </div>
              </button>

              {/* Status toggle */}
              <button
                onClick={() => handleStatusChange(post)}
                disabled={isPending}
                className="flex-shrink-0"
                title={`Click to advance to ${STATUS_CYCLE[post.status as PostStatus]}`}
              >
                <Badge variant={post.status as PostStatus}>
                  {STATUS_LABELS[post.status as PostStatus]}
                </Badge>
              </button>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {(post.status === 'draft' || post.status === 'scheduled') && (
                  <button
                    onClick={() => { setEditorPost(post); setEditorOpen(true) }}
                    className="p-1.5 rounded text-zinc-600 hover:text-yellow-400 transition-colors"
                    title={post.status === 'scheduled' ? 'Reschedule' : 'Schedule'}
                  >
                    <Calendar className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => handleCopy(post)}
                  className="p-1.5 rounded text-zinc-600 hover:text-zinc-300 transition-colors"
                  title="Copy post"
                >
                  {copiedId === post.id
                    ? <Check className="w-3.5 h-3.5 text-green-400" />
                    : <Copy className="w-3.5 h-3.5" />
                  }
                </button>
                <button
                  onClick={() => handleDelete(post.id)}
                  className="p-1.5 rounded text-zinc-600 hover:text-red-400 transition-colors"
                  title="Delete post"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>

    <PostEditorModal
      post={editorPost}
      open={editorOpen}
      onOpenChange={open => { setEditorOpen(open); if (!open) setEditorPost(null) }}
      onUpdate={handleUpdated}
      onDelete={handleDeleted}
      companyId={companyId}
    />
    </>
  )
}
