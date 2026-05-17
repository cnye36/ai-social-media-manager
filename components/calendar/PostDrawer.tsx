'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { X, Copy, Check, Trash2, CalendarClock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LinkedInIcon, XIcon, RedditIcon, FacebookIcon } from '@/components/ui/channel-icons'
import { cn } from '@/lib/utils'
import type { Post, Channel, PostStatus } from '@/types/database'

const CHANNEL_ICONS: Record<Channel, React.ReactNode> = {
  linkedin: <LinkedInIcon className="w-3.5 h-3.5" />,
  x: <XIcon className="w-3.5 h-3.5" />,
  reddit: <RedditIcon className="w-3.5 h-3.5" />,
  facebook: <FacebookIcon className="w-3.5 h-3.5" />,
}

const STATUSES: PostStatus[] = ['draft', 'scheduled', 'published', 'archived']

interface PostDrawerProps {
  post: Post
  onClose: () => void
  onUpdate: (updated: Post) => void
  onDelete: (id: string) => void
}

export function PostDrawer({ post, onClose, onUpdate, onDelete }: PostDrawerProps) {
  const [content, setContent] = useState(post.content)
  const [status, setStatus] = useState<PostStatus>(post.status as PostStatus)
  const [scheduledFor, setScheduledFor] = useState(
    post.scheduled_for ? format(new Date(post.scheduled_for), "yyyy-MM-dd'T'HH:mm") : ''
  )
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    const res = await fetch(`/api/posts/${post.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        status,
        scheduled_for: scheduledFor ? new Date(scheduledFor).toISOString() : null,
      }),
    })
    if (res.ok) {
      const updated = await res.json()
      onUpdate(updated)
    }
    setSaving(false)
  }

  async function handleDelete() {
    await fetch(`/api/posts/${post.id}`, { method: 'DELETE' })
    onDelete(post.id)
    onClose()
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-zinc-900 border-l border-zinc-800 z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Badge variant={post.channel as Channel} className="gap-1.5">
              {CHANNEL_ICONS[post.channel as Channel]}
              {post.channel}
            </Badge>
            <span className="text-xs text-zinc-500">
              {format(new Date(post.created_at), 'MMM d, yyyy')}
            </span>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Content editor */}
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-500 uppercase tracking-wide">Content</label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={10}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            {post.channel === 'x' && (
              <p className={cn('text-xs text-right', content.length > 280 ? 'text-red-400' : 'text-zinc-500')}>
                {content.length}/280
              </p>
            )}
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-500 uppercase tracking-wide">Status</label>
            <div className="flex gap-2">
              {STATUSES.map(s => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={cn(
                    'flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors',
                    status === s
                      ? 'bg-violet-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:text-white'
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Schedule */}
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-500 uppercase tracking-wide flex items-center gap-1.5">
              <CalendarClock className="w-3.5 h-3.5" />
              Schedule for
            </label>
            <input
              type="datetime-local"
              value={scheduledFor}
              onChange={e => {
                setScheduledFor(e.target.value)
                if (e.target.value) setStatus('scheduled')
              }}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500 [color-scheme:dark]"
            />
            {scheduledFor && (
              <button
                onClick={() => { setScheduledFor(''); setStatus('draft') }}
                className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
              >
                Clear schedule
              </button>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-zinc-800 flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? 'Saving...' : 'Save changes'}
          </Button>
          <Button variant="secondary" size="icon" onClick={handleCopy} title="Copy post">
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          </Button>
          <Button variant="destructive" size="icon" onClick={handleDelete} title="Delete post">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </>
  )
}
