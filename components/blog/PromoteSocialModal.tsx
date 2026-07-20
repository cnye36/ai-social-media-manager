'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Loader2, Send, Trash2, Pencil, CalendarClock, CheckCircle2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { LinkedInIcon, XIcon as XLogoIcon, RedditIcon, FacebookIcon } from '@/components/ui/channel-icons'
import { PostEditorModal } from '@/components/posts/PostEditorModal'
import type { Channel, Post, ArticleStatus } from '@/types/database'

const CHANNELS: { id: Channel; label: string; icon: React.ReactNode }[] = [
  { id: 'linkedin', label: 'LinkedIn', icon: <LinkedInIcon className="w-3.5 h-3.5" /> },
  { id: 'x', label: 'X / Twitter', icon: <XLogoIcon className="w-3.5 h-3.5" /> },
  { id: 'facebook', label: 'Facebook', icon: <FacebookIcon className="w-3.5 h-3.5" /> },
  { id: 'reddit', label: 'Reddit', icon: <RedditIcon className="w-3.5 h-3.5" /> },
]

interface PromoteSocialModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  articleId: string
  companyId: string
  articleStatus: ArticleStatus
  articleScheduledFor: string | null
  brandColors?: { primary?: string; accent?: string }
}

export function PromoteSocialModal({
  open, onOpenChange, articleId, companyId, articleStatus, articleScheduledFor, brandColors,
}: PromoteSocialModalProps) {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [selectedChannels, setSelectedChannels] = useState<Channel[]>(['linkedin', 'x'])
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')
  const [editorPost, setEditorPost] = useState<Post | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setLoadError('')
    fetch(`/api/posts?companyId=${companyId}&articleId=${articleId}`)
      .then(res => { if (!res.ok) throw new Error('Failed to load posts'); return res.json() })
      .then((data: Post[]) => setPosts(data))
      .catch(() => setLoadError('Could not load existing promo posts'))
      .finally(() => setLoading(false))
  }, [open, companyId, articleId])

  const generatedChannels = new Set(posts.map(p => p.channel))

  function toggleChannel(ch: Channel) {
    setSelectedChannels(prev => prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch])
  }

  async function generate() {
    if (!selectedChannels.length) return
    setGenerating(true)
    setGenerateError('')
    try {
      const res = await fetch(`/api/articles/${articleId}/social`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels: selectedChannels }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to generate')
      setPosts(prev => [...(data.posts as Post[]), ...prev])
    } catch (e) {
      setGenerateError((e as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  async function discardPost(id: string) {
    setPosts(prev => prev.filter(p => p.id !== id))
    await fetch(`/api/posts/${id}`, { method: 'DELETE' })
  }

  function openEditor(post: Post) {
    setEditorPost(post)
    setEditorOpen(true)
  }

  function handleEditorUpdate(updated: Post) {
    setPosts(prev => prev.map(p => p.id === updated.id ? updated : p))
  }

  function handleEditorDelete(id: string) {
    setPosts(prev => prev.filter(p => p.id !== id))
    setEditorOpen(false)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
          <div className="px-6 py-5 border-b border-zinc-800 flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-4 h-4 text-violet-400" />
              Promote on social media
            </DialogTitle>
            <DialogDescription>
              Generate per-channel drafts from this article, then edit, score, schedule, and send them to Buffer.
            </DialogDescription>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Channel picker + generate */}
            <div className="space-y-3">
              <p className="text-xs text-zinc-500">Select channels to generate posts for:</p>
              <div className="flex flex-wrap gap-2">
                {CHANNELS.map(({ id, label, icon }) => (
                  <button
                    key={id}
                    onClick={() => toggleChannel(id)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                      selectedChannels.includes(id)
                        ? 'bg-violet-600/20 border-violet-500/50 text-violet-300'
                        : 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:text-white'
                    )}
                  >
                    {icon}
                    {label}
                    {generatedChannels.has(id) && (
                      <CheckCircle2 className="w-3 h-3 text-green-400" />
                    )}
                  </button>
                ))}
              </div>
              <Button size="sm" onClick={generate} disabled={generating || selectedChannels.length === 0} className="gap-1.5">
                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {generating ? 'Generating…' : 'Generate posts'}
              </Button>
              {(articleStatus === 'draft' || articleStatus === 'archived') && (
                <p className="text-xs text-zinc-600">
                  This article isn&apos;t scheduled yet — scheduled promo posts will default to the next available
                  slot unless you pick a specific time when editing them.
                </p>
              )}
              {generateError && <p className="text-xs text-red-400">{generateError}</p>}
            </div>

            {/* Existing / generated posts */}
            <div className="space-y-2">
              {loading && (
                <div className="flex items-center gap-2 text-sm text-zinc-500 py-6 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading…
                </div>
              )}
              {loadError && <p className="text-xs text-red-400">{loadError}</p>}
              {!loading && posts.length === 0 && !loadError && (
                <div className="text-center py-10 border border-dashed border-zinc-800 rounded-xl">
                  <p className="text-sm text-zinc-500">No promo posts yet</p>
                  <p className="text-xs text-zinc-600 mt-1">Pick channels above and generate your first drafts</p>
                </div>
              )}
              {posts.map(post => (
                <button
                  key={post.id}
                  onClick={() => openEditor(post)}
                  className="w-full text-left rounded-xl border border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 transition-colors p-3.5 space-y-2 group"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={post.channel}>{post.channel}</Badge>
                      <Badge variant={post.status}>{post.status}</Badge>
                      {post.scheduled_for && (
                        <span className="flex items-center gap-1 text-xs text-yellow-500">
                          <CalendarClock className="w-3 h-3" />
                          {format(new Date(post.scheduled_for), 'MMM d · h:mm a')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300">
                        <Pencil className="w-3.5 h-3.5" />
                      </span>
                      <span
                        role="button"
                        onClick={e => { e.stopPropagation(); void discardPost(post.id) }}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400"
                        title="Discard draft"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-zinc-400 leading-relaxed line-clamp-2">{post.content}</p>
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <PostEditorModal
        post={editorPost}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onUpdate={handleEditorUpdate}
        onDelete={handleEditorDelete}
        companyId={companyId}
        brandColors={brandColors}
      />
    </>
  )
}
