'use client'

// Role: channel-filtered post history inside the Social section's channel tabs.
// Full cross-channel management lives at /posts (PostsTable).

import { useState, useEffect, useCallback } from 'react'
import { Loader2, User, Building2, History, RefreshCw, Copy, Check, Trash2, Pencil, GitBranch } from 'lucide-react'
import { PostEditorModal } from '@/components/posts/PostEditorModal'
import { PostViewToggle } from '@/components/posts/PostViewToggle'
import { PostGridView } from '@/components/posts/PostGridView'
import { PostsMiniCalendar } from '@/components/posts/PostsMiniCalendar'
import { cn } from '@/lib/utils'
import { format, formatDistanceToNow } from 'date-fns'
import type { Post } from '@/types/database'
import type { PostView } from '@/components/posts/PostViewToggle'
import { postBodyForPublish } from '@/lib/generate/image-prompt'
import { COMPANY_ACCENT, type ChannelConfig, type ChannelVoice } from '@/lib/social/channel-config'
import { STATUS_STYLES, STATUS_ICONS } from './constants'

interface ChannelHistoryProps {
  config: ChannelConfig
  companyId: string
  refreshKey: number
}

export function ChannelHistory({ config, companyId, refreshKey }: ChannelHistoryProps) {
  const { Icon } = config
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editorPost, setEditorPost] = useState<Post | null>(null)
  const [view, setView] = useState<PostView>('list')

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/posts?companyId=${companyId}&channel=${config.id}`)
      if (!res.ok) throw new Error('Failed to load posts')
      const data = await res.json() as Post[]
      setPosts(data)
    } catch {
      setError(`Could not load ${config.shortName} posts`)
    } finally {
      setLoading(false)
    }
  }, [companyId, config.id, config.shortName])

  useEffect(() => { fetchPosts() }, [fetchPosts, refreshKey])

  async function handleCopy(post: Post) {
    await navigator.clipboard.writeText(postBodyForPublish(post.content))
    setCopiedId(post.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  async function handleDelete(postId: string) {
    setDeletingId(postId)
    try {
      await fetch(`/api/posts/${postId}`, { method: 'DELETE' })
      setPosts(prev => prev.filter(p => p.id !== postId))
    } finally {
      setDeletingId(null)
    }
  }

  function handleEditorUpdate(updated: Post) {
    setPosts(prev => prev.map(p => p.id === updated.id ? updated : p))
  }

  function handleEditorDelete(id: string) {
    setPosts(prev => prev.filter(p => p.id !== id))
    setEditorPost(null)
  }

  const getVoice = (post: Post): ChannelVoice | null => {
    const v = post.generation_params?.[config.voiceParamKey]
    return v === 'personal' || v === 'company' ? v : null
  }

  const isThread = (post: Post) => {
    if (!config.supportsThreads) return false
    const variants = post.content_variants as Record<string, unknown>
    return Array.isArray(variants?.thread)
  }

  const tweetCount = (post: Post): number => {
    const variants = post.content_variants as Record<string, unknown>
    return Array.isArray(variants?.thread) ? (variants.thread as unknown[]).length : 0
  }

  function voiceChip(v: ChannelVoice) {
    return (
      <span className={cn(
        'text-[10px] font-medium px-1.5 py-0.5 rounded border capitalize',
        v === 'personal' ? config.personal.chip : COMPANY_ACCENT.chip
      )}>
        {v === 'personal' ? 'Personal' : config.companyVoiceLabel}
      </span>
    )
  }

  function threadChip(count: number) {
    return (
      <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border text-sky-400 bg-sky-900/20 border-sky-700/30">
        <GitBranch className="w-2.5 h-2.5" />
        Thread{count > 0 ? ` · ${count}` : ''}
      </span>
    )
  }

  return (
    <div className="mt-12">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <History className="w-4 h-4 text-zinc-500" />
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">
            Recent {config.shortName} Posts
          </h2>
          {!loading && <span className="text-xs text-zinc-600">({posts.length})</span>}
        </div>
        <div className="flex items-center gap-2">
          <PostViewToggle view={view} onChange={setView} />
          <button
            onClick={fetchPosts}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-400 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-4 py-3">{error}</p>
      )}

      {loading && posts.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-zinc-600 py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading posts…
        </div>
      )}

      {!loading && posts.length === 0 && !error && (
        <div className="text-center py-12 border border-dashed border-edge rounded-xl">
          <Icon className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
          <p className="text-sm text-zinc-500">No {config.shortName} posts yet</p>
          <p className="text-xs text-zinc-600 mt-1">Generate your first post above</p>
        </div>
      )}

      {posts.length > 0 && view === 'list' && (
        <div className="space-y-2">
          {posts.map(post => {
            const postVoice = getVoice(post)
            const thread = isThread(post)
            const count = tweetCount(post)
            const body = postBodyForPublish(post.content)
            const preview = body.length > 160 ? body.slice(0, 160).trimEnd() + '…' : body
            const charCount = body.length
            const dateLabel = post.published_at
              ? `Published ${formatDistanceToNow(new Date(post.published_at), { addSuffix: true })}`
              : post.scheduled_for
                ? `Scheduled ${format(new Date(post.scheduled_for), 'MMM d, h:mm a')}`
                : `Created ${formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}`

            return (
              <div
                key={post.id}
                className="group flex items-start gap-4 px-4 py-3.5 bg-surface-1 border border-edge rounded-xl hover:border-edge-strong transition-colors"
              >
                <div className="shrink-0 pt-0.5">
                  {postVoice === 'personal' ? (
                    <div title="Personal post" className={cn('w-7 h-7 rounded-full border flex items-center justify-center', config.personal.avatar)}>
                      <User className={cn('w-3.5 h-3.5', config.personal.avatarIcon)} />
                    </div>
                  ) : postVoice === 'company' ? (
                    <div title="Company post" className={cn('w-7 h-7 rounded-full border flex items-center justify-center', COMPANY_ACCENT.avatar)}>
                      <Building2 className={cn('w-3.5 h-3.5', COMPANY_ACCENT.avatarIcon)} />
                    </div>
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-surface-2 border border-edge flex items-center justify-center">
                      <Icon className="w-3.5 h-3.5 text-zinc-500" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    {postVoice && voiceChip(postVoice)}
                    {thread && threadChip(count)}
                    {config.supportsThreads && !thread && (
                      <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', charCount > 280 ? 'text-red-400 bg-red-900/20' : 'text-zinc-500 bg-zinc-800/60')}>
                        {charCount}/280
                      </span>
                    )}
                    <span className={cn('flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded capitalize', STATUS_STYLES[post.status])}>
                      {STATUS_ICONS[post.status]}
                      {post.status}
                    </span>
                    <span className="text-[10px] text-zinc-600">{dateLabel}</span>
                  </div>
                  <p className="text-sm text-zinc-400 leading-relaxed line-clamp-2">{preview}</p>
                </div>
                <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => setEditorPost(post)} title="Edit post" className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-surface-2 transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleCopy(post)} title="Copy content" className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-surface-2 transition-colors">
                    {copiedId === post.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => handleDelete(post.id)} disabled={deletingId === post.id} title="Delete post" className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-900/20 transition-colors disabled:opacity-40">
                    {deletingId === post.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {posts.length > 0 && view === 'grid' && (
        <PostGridView
          posts={posts}
          copiedId={copiedId}
          deletingId={deletingId}
          onEdit={setEditorPost}
          onCopy={handleCopy}
          onDelete={handleDelete}
          renderBadge={post => {
            const v = getVoice(post)
            const thread = isThread(post)
            const count = tweetCount(post)
            return (
              <>
                {v && voiceChip(v)}
                {thread && threadChip(count)}
              </>
            )
          }}
        />
      )}

      {posts.length > 0 && view === 'calendar' && (
        <PostsMiniCalendar
          posts={posts}
          onEdit={post => setEditorPost(post)}
          chipBg={config.calendarChip.bg}
          chipText={config.calendarChip.text}
          chipIcon={<Icon className="w-2.5 h-2.5 shrink-0" />}
        />
      )}

      {editorPost && (
        <PostEditorModal
          post={editorPost}
          open={!!editorPost}
          onOpenChange={open => { if (!open) setEditorPost(null) }}
          onUpdate={handleEditorUpdate}
          onDelete={handleEditorDelete}
          companyId={companyId}
        />
      )}
    </div>
  )
}
