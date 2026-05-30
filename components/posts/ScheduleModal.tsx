'use client'

import { useState } from 'react'
import { Sparkles, CalendarClock } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { Post } from '@/types/database'

interface Props {
  post: Post | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onScheduled: (updated: Post) => void
  companyId?: string
}

type Mode = 'best' | 'manual'

const SOCIAL_CHANNELS = new Set(['linkedin', 'x', 'facebook'])

// datetime-local input needs "YYYY-MM-DDTHH:mm" format in local time
function toDatetimeLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function nowPlusFive(): string {
  return toDatetimeLocal(new Date(Date.now() + 5 * 60_000).toISOString())
}

export function ScheduleModal({ post, open, onOpenChange, onScheduled, companyId }: Props) {
  const isSocial = post ? SOCIAL_CHANNELS.has(post.channel) : false
  const [mode, setMode] = useState<Mode>(isSocial ? 'best' : 'manual')
  const [datetime, setDatetime] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function handleOpenChange(val: boolean) {
    if (val && post) {
      setMode(isSocial ? 'best' : 'manual')
      setDatetime(toDatetimeLocal(post.scheduled_for) || nowPlusFive())
    }
    if (!val) setError('')
    onOpenChange(val)
  }

  async function handleSave() {
    if (!post) return
    setSaving(true)
    setError('')

    try {
      if (mode === 'best') {
        const res = await fetch(`/api/posts/${post.id}/approve`, { method: 'POST' })
        if (!res.ok) {
          const d = await res.json() as { error?: string }
          throw new Error(d.error ?? 'Schedule failed')
        }
        const updated = await res.json() as Post
        onScheduled(updated)
        onOpenChange(false)
      } else {
        if (!datetime) return
        const scheduledFor = new Date(datetime).toISOString()
        const res = await fetch(`/api/posts/${post.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scheduled_for: scheduledFor, status: 'scheduled' }),
        })
        if (!res.ok) {
          const d = await res.json() as { error?: string }
          throw new Error(d.error ?? 'Save failed')
        }
        const updated = await res.json() as Post
        onScheduled(updated)
        onOpenChange(false)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleUnschedule() {
    if (!post) return
    setSaving(true)
    try {
      const res = await fetch(`/api/posts/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduled_for: null, status: 'draft' }),
      })
      if (!res.ok) throw new Error('Failed to unschedule')
      const updated = await res.json() as Post
      onScheduled(updated)
      onOpenChange(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (!post) return null

  const minDatetime = toDatetimeLocal(new Date().toISOString())

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule post</DialogTitle>
          <DialogDescription>
            Choose when this {post.channel} post should go live.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg bg-zinc-800 p-3 text-sm text-zinc-300 line-clamp-3">
            {post.content}
          </div>

          {isSocial && (
            <div className="flex gap-2">
              <button
                onClick={() => setMode('best')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-colors',
                  mode === 'best'
                    ? 'border-violet-500 bg-violet-600/20 text-violet-300'
                    : 'border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600'
                )}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Best time
              </button>
              <button
                onClick={() => setMode('manual')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-colors',
                  mode === 'manual'
                    ? 'border-violet-500 bg-violet-600/20 text-violet-300'
                    : 'border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600'
                )}
              >
                <CalendarClock className="w-3.5 h-3.5" />
                Pick time
              </button>
            </div>
          )}

          {mode === 'best' && isSocial ? (
            <p className="text-sm text-zinc-400">
              The post will be added to your next available{' '}
              <span className="text-white font-medium">{post.channel}</span> slot based on your posting
              schedule. Configure your schedule in{' '}
              <span className="text-violet-400">Settings → Posting Schedule</span>.
            </p>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="schedule-dt">Date &amp; time</Label>
              <input
                id="schedule-dt"
                type="datetime-local"
                value={datetime}
                min={minDatetime}
                onChange={e => setDatetime(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500 [color-scheme:dark]"
              />
              <p className="text-xs text-zinc-500">Times are in your local timezone.</p>
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex gap-2 pt-1">
            <Button
              onClick={handleSave}
              disabled={saving || (mode === 'manual' && !datetime)}
              className="flex-1"
            >
              {saving ? 'Saving…' : mode === 'best' ? 'Approve & schedule' : 'Schedule'}
            </Button>
            {post.status === 'scheduled' && (
              <Button variant="outline" onClick={handleUnschedule} disabled={saving}>
                Unschedule
              </Button>
            )}
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
