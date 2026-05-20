'use client'

import { useEffect, useState } from 'react'
import { Calendar, Trash2, ArchiveX, Clock } from 'lucide-react'
import { format } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PostEditorModal } from './PostEditorModal'
import type { Channel, Post, PostStatus } from '@/types/database'

type Tab = 'all' | PostStatus

const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Drafts' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'published', label: 'Published' },
  { id: 'archived', label: 'Archived' },
]

export function PostList({ companyId }: { companyId: string }) {
  const [posts, setPosts] = useState<Post[]>([])
  const [tab, setTab] = useState<Tab>('all')
  const [loading, setLoading] = useState(true)
  const [editorPost, setEditorPost] = useState<Post | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    const url = tab === 'all'
      ? `/api/posts?companyId=${companyId}`
      : `/api/posts?companyId=${companyId}&status=${tab}`
    fetch(url, { signal: controller.signal })
      .then(r => r.json())
      .then(d => setPosts(Array.isArray(d) ? d : []))
      .catch(e => { if ((e as Error).name !== 'AbortError') console.error(e) })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [companyId, tab])

  function openEditor(post: Post) {
    setEditorPost(post)
    setEditorOpen(true)
  }

  function handleUpdated(updated: Post) {
    setPosts(prev => prev.map(p => p.id === updated.id ? updated : p))
  }

  function handleDeleted(id: string) {
    setPosts(prev => prev.filter(p => p.id !== id))
  }

  async function handleArchive(post: Post) {
    const res = await fetch(`/api/posts/${post.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'archived' }),
    })
    if (res.ok) {
      const updated = await res.json() as Post
      setPosts(prev => prev.map(p => p.id === updated.id ? updated : p))
    }
  }

  async function handleDelete(post: Post) {
    if (!confirm('Delete this post? This cannot be undone.')) return
    const res = await fetch(`/api/posts/${post.id}`, { method: 'DELETE' })
    if (res.ok) setPosts(prev => prev.filter(p => p.id !== post.id))
  }


  return (
    <>
      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-zinc-800 pb-0">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.id
                ? 'border-violet-500 text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {t.label}
            {t.id !== 'all' && (
              <span className="ml-1.5 text-xs text-zinc-600">
                {posts.filter(p => p.status === t.id).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 rounded-xl bg-zinc-800/50 animate-pulse" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16 text-zinc-500 text-sm">
          No {tab === 'all' ? '' : tab} posts yet.
        </div>
      ) : (
        <div className="space-y-2">
          {posts.map(post => (
            <div
              key={post.id}
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-4 flex items-start gap-4 hover:border-zinc-700 transition-colors"
            >
              <div className="flex flex-col gap-1.5 flex-shrink-0 pt-0.5">
                <Badge variant={post.channel as Channel}>{post.channel}</Badge>
                <Badge variant={post.status as PostStatus}>{post.status}</Badge>
              </div>

              <button
                className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
                onClick={() => openEditor(post)}
              >
                <p className="text-sm text-zinc-300 line-clamp-2">{post.content}</p>
                <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500">
                  <span>Created {format(new Date(post.created_at), 'MMM d, yyyy')}</span>
                  {post.scheduled_for && (
                    <span className="flex items-center gap-1 text-yellow-400">
                      <Clock className="w-3 h-3" />
                      {format(new Date(post.scheduled_for), 'MMM d · h:mm a')}
                    </span>
                  )}
                  {post.published_at && (
                    <span className="text-green-400">
                      Published {format(new Date(post.published_at), 'MMM d · h:mm a')}
                    </span>
                  )}
                </div>
              </button>

              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => openEditor(post)}
                  className="gap-1.5"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  Edit
                </Button>
                {post.status !== 'archived' && (
                  <Button size="sm" variant="ghost" onClick={() => handleArchive(post)} title="Archive">
                    <ArchiveX className="w-3.5 h-3.5" />
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => handleDelete(post)} title="Delete" className="text-red-400 hover:text-red-300">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

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
