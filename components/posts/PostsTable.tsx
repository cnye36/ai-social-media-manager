'use client'

// Role: the manage-everything view — all channels, all statuses (/posts).
// Channel-filtered history lives in the Social tabs (ChannelHistory);
// scheduling lives in /calendar; the dashboard shows a read-only recent list.

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { Copy, Check, Trash2, CalendarClock, Calendar, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react'
import { PostEditorModal } from './PostEditorModal'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LinkedInIcon, XIcon, RedditIcon, FacebookIcon } from '@/components/ui/channel-icons'
import { cn } from '@/lib/utils'
import { isXThreadPost, xThreadTweetCount } from '@/lib/posts/x-format'
import type { Post, Channel, PostStatus } from '@/types/database'

const SOCIAL_CHANNELS: Channel[] = ['linkedin', 'x', 'facebook']

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
  totalCount?: number
  page?: number
  pageSize?: number
}

export function PostsTable({ posts: initialPosts, companyId, totalCount, page = 1, pageSize = 20 }: PostsTableProps) {
  const [posts, setPosts] = useState<Post[]>(initialPosts)
  const [channelFilter, setChannelFilter] = useState<Channel | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<PostStatus | 'all'>('all')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [approveError, setApproveError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [editorPost, setEditorPost] = useState<Post | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)

  const channels: (Channel | 'all')[] = ['all', 'linkedin', 'x', 'reddit', 'facebook']
  const statuses: (PostStatus | 'all')[] = ['all', 'draft', 'scheduled', 'published', 'archived']

  const totalPages = Math.max(1, Math.ceil((totalCount ?? initialPosts.length) / pageSize))

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

  async function handleApprove(post: Post) {
    setApprovingId(post.id)
    setApproveError(null)
    const res = await fetch(`/api/posts/${post.id}/approve`, { method: 'POST' })
    const data = await res.json() as Post & { error?: string }
    if (res.ok) {
      setPosts(prev => prev.map(p => p.id === post.id ? data : p))
    } else {
      setApproveError(data.error ?? 'Failed to approve')
    }
    setApprovingId(null)
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

      {/* Post count + approve errors */}
      <p className="text-sm text-zinc-500">
        {filtered.length} post{filtered.length !== 1 ? 's' : ''} on this page
        {totalCount != null && ` · ${totalCount} total`}
      </p>
      {approveError && (
        <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
          {approveError}
        </p>
      )}

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
                {post.status === 'draft' && SOCIAL_CHANNELS.includes(post.channel as Channel) && (
                  <button
                    onClick={() => handleApprove(post)}
                    disabled={approvingId === post.id}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-violet-600/20 text-violet-300 hover:bg-violet-600/40 transition-colors disabled:opacity-50"
                    title="Approve — schedule in next available slot"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    {approvingId === post.id ? '…' : 'Approve'}
                  </button>
                )}
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <Link
            href={`?page=${page - 1}`}
            aria-disabled={page <= 1}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              page <= 1
                ? 'pointer-events-none text-zinc-700'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            )}
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </Link>
          <span className="text-xs text-zinc-500">
            Page {page} of {totalPages}
          </span>
          <Link
            href={`?page=${page + 1}`}
            aria-disabled={page >= totalPages}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              page >= totalPages
                ? 'pointer-events-none text-zinc-700'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            )}
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </Link>
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
