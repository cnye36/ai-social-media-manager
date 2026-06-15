'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import {
  ArrowLeft, CalendarClock, CalendarDays, List, Loader2, PenLine, Sparkles, CheckCircle2,
  X as DismissIcon, Trash2, RefreshCw,
} from 'lucide-react'
import { PlanSlotsCalendar } from '@/components/planner/PlanSlotsCalendar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PostEditorModal } from '@/components/posts/PostEditorModal'
import { SendToBufferButton } from '@/components/posts/SendToBufferButton'
import { LinkedInIcon, XIcon, RedditIcon, FacebookIcon } from '@/components/ui/channel-icons'
import { cn } from '@/lib/utils'
import { CHANNEL_PLAYBOOKS, isThreadSlot } from '@/lib/content-planning/channel-playbook'
import { postBodyForPublish } from '@/lib/generate/image-prompt'
import type { Channel, Post } from '@/types/database'
import type { ContentPlanWithSlots, ContentPlanSlot } from '@/types/content-planning'

const CHANNEL_ICON: Record<Channel, React.ReactNode> = {
  linkedin: <LinkedInIcon className="w-3.5 h-3.5" />,
  x: <XIcon className="w-3.5 h-3.5" />,
  reddit: <RedditIcon className="w-3.5 h-3.5" />,
  facebook: <FacebookIcon className="w-3.5 h-3.5" />,
}

const SLOT_STATUS_LABEL: Record<string, string> = {
  planned: 'Planned',
  writing: 'Writing…',
  written: 'Draft ready',
  skipped: 'Skipped',
}

interface PlanDetailClientProps {
  companyId: string
  initialPlan: ContentPlanWithSlots
}

export function PlanDetailClient({ companyId, initialPlan }: PlanDetailClientProps) {
  const [plan, setPlan] = useState(initialPlan)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [writing, setWriting] = useState(false)
  const [writeProgress, setWriteProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Posts keyed by post_id for inline review
  const [posts, setPosts] = useState<Record<string, Post>>({})
  const [editingPost, setEditingPost] = useState<Post | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [approving, setApproving] = useState<string | null>(null)
  const [scheduleView, setScheduleView] = useState<'list' | 'calendar'>('calendar')

  const plannedSlots = plan.slots.filter(s => s.status === 'planned')
  const writtenSlots = plan.slots.filter(s => s.status === 'written')
  const activeSlots = plan.slots
    .filter(s => s.status !== 'skipped')
    .sort((a, b) => new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime())
  const writtenCount = plan.slots.filter(s => s.status === 'written').length

  // Load posts for all written slots
  async function loadPostsForSlots(slots: ContentPlanSlot[]) {
    const toLoad = slots.filter(s => s.post_id && s.status === 'written' && !posts[s.post_id])
    if (!toLoad.length) return

    const results = await Promise.all(
      toLoad.map(async (slot) => {
        const res = await fetch(`/api/posts/${slot.post_id}`)
        if (!res.ok) return null
        return res.json() as Promise<Post>
      })
    )

    const postMap: Record<string, Post> = {}
    toLoad.forEach((slot, i) => {
      const p = results[i]
      if (p && slot.post_id) postMap[slot.post_id] = p
    })
    if (Object.keys(postMap).length > 0) {
      setPosts(prev => ({ ...prev, ...postMap }))
    }
  }

  useEffect(() => {
    loadPostsForSlots(plan.slots)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggleSlot(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllPlanned() {
    setSelected(new Set(plannedSlots.map(s => s.id)))
  }

  async function refreshPlan() {
    const res = await fetch(`/api/content-plans/${plan.id}`)
    if (res.ok) {
      const data = await res.json()
      setPlan(data)
      await loadPostsForSlots(data.slots)
    }
  }

  async function writeBatch(all = false) {
    const slotIds = all ? undefined : [...selected]
    if (!all && (!slotIds || slotIds.length === 0)) {
      setError('Select at least one slot to write')
      return
    }

    setWriting(true)
    setError(null)
    setWriteProgress(all ? `Writing ${plannedSlots.length} posts…` : `Writing ${slotIds!.length} posts…`)

    try {
      const res = await fetch(`/api/content-plans/${plan.id}/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          slotIds,
          additionalContext: plan.additional_context,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Write failed')

      await refreshPlan()
      setSelected(new Set())
      setWriteProgress(
        `Done — ${data.written?.length ?? 0} written` +
          (data.errors?.length ? `, ${data.errors.length} failed` : '') +
          '. Review the drafts below and approve the ones you want to schedule.',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Write failed')
    } finally {
      setWriting(false)
    }
  }

  function openEditor(post: Post) {
    setEditingPost(post)
    setEditorOpen(true)
  }

  function handleSlotClick(slot: ContentPlanSlot, post?: Post) {
    if (post) {
      openEditor(post)
      return
    }
    if (slot.status === 'planned') {
      toggleSlot(slot.id)
    }
  }

  function handlePostUpdate(updated: Post) {
    setPosts(prev => ({ ...prev, [updated.id]: updated }))
    setEditingPost(updated)
  }

  async function approveSlot(slot: ContentPlanSlot) {
    if (!slot.post_id) return
    setApproving(slot.id)
    try {
      const res = await fetch(`/api/posts/${slot.post_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'scheduled',
          scheduled_for: slot.scheduled_for,
        }),
      })
      if (res.ok) {
        const updated: Post = await res.json()
        setPosts(prev => ({ ...prev, [slot.post_id!]: updated }))
      }
    } finally {
      setApproving(null)
    }
  }

  async function skipSlot(slotId: string) {
    const res = await fetch(`/api/content-plans/slots/${slotId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'skipped' }),
    })
    if (res.ok) {
      setPlan(prev => ({
        ...prev,
        slots: prev.slots.map(s => s.id === slotId ? { ...s, status: 'skipped' as const } : s),
      }))
    }
  }

  async function deleteSlotPost(slot: ContentPlanSlot) {
    if (!slot.post_id) return
    if (!confirm('Delete this draft? The slot will be reset so you can re-write it.')) return

    const [deleteRes, slotRes] = await Promise.all([
      fetch(`/api/posts/${slot.post_id}`, { method: 'DELETE' }),
      fetch(`/api/content-plans/slots/${slot.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'planned', post_id: null }),
      }),
    ])

    if (deleteRes.ok) {
      setPosts(prev => {
        const next = { ...prev }
        if (slot.post_id) delete next[slot.post_id]
        return next
      })
      if (slotRes.ok) {
        setPlan(prev => ({
          ...prev,
          slots: prev.slots.map(s =>
            s.id === slot.id ? { ...s, status: 'planned' as const, post_id: null } : s,
          ),
        }))
      }
    }
  }

  const pillars = plan.content_pillars ?? []
  const insights = Object.values(plan.posting_insights ?? {})

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/${companyId}/planner`}
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          All plans
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">{plan.name}</h1>
            <p className="text-sm text-zinc-500 mt-1">
              {format(parseISO(plan.start_date), 'MMM d')} –{' '}
              {format(parseISO(plan.end_date), 'MMM d, yyyy')}
              {' · '}
              {writtenCount}/{plan.slots.length} written
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={selectAllPlanned}
              disabled={plannedSlots.length === 0}
            >
              Select all planned
            </Button>
            <Button
              size="sm"
              onClick={() => writeBatch(false)}
              disabled={writing || selected.size === 0}
            >
              {writing ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenLine className="w-4 h-4" />}
              Write selected ({selected.size})
            </Button>
            <Button
              size="sm"
              onClick={() => writeBatch(true)}
              disabled={writing || plannedSlots.length === 0}
            >
              <Sparkles className="w-4 h-4" />
              Write all ({plannedSlots.length})
            </Button>
          </div>
        </div>
      </div>

      {plan.strategy_summary && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <h2 className="text-sm font-medium text-violet-300 mb-2">Strategy</h2>
          <p className="text-sm text-zinc-300 leading-relaxed">{plan.strategy_summary}</p>
        </div>
      )}

      {pillars.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-zinc-400 mb-3">Content pillars (recycle monthly)</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {pillars.map(p => (
              <div key={p.name} className="rounded-lg border border-zinc-800 p-4 bg-zinc-900/30">
                <p className="font-medium text-white text-sm">{p.name}</p>
                <p className="text-xs text-zinc-500 mt-1">{p.frequency}</p>
                <p className="text-xs text-zinc-400 mt-2">{p.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {plan.channels.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-zinc-400 mb-3">Platform cadence</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {plan.channels.map(ch => {
              const pb = CHANNEL_PLAYBOOKS[ch as Channel]
              return (
                <div key={ch} className="rounded-lg border border-zinc-800 p-3 text-xs">
                  <p className="font-medium text-white capitalize mb-1">{pb.label}</p>
                  <p className="text-zinc-400">
                    {pb.postsPerWeek.min}–{pb.postsPerWeek.max}/week
                    {pb.postsPerDay && ` · ${pb.postsPerDay.min}–${pb.postsPerDay.max}/day`}
                  </p>
                  {pb.formatMix.thread != null && (
                    <p className="text-zinc-600 mt-1">
                      Mix: {Math.round((pb.formatMix.single ?? 0) * 100)}% singles,{' '}
                      {Math.round((pb.formatMix.thread ?? 0) * 100)}% threads
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {insights.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-zinc-400 mb-3">Best times (from your history)</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {insights.map(ins => (
              <div key={ins.channel} className="rounded-lg border border-zinc-800 p-3 text-xs">
                <p className="font-medium text-white capitalize mb-1">{ins.channel}</p>
                <p className="text-zinc-500">{ins.best_days.join(', ')}</p>
                <p className="text-zinc-600 mt-1">
                  {ins.best_hours_utc.map(h => `${h}:00 UTC`).join(', ')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {plan.additional_context && (
        <div className="text-sm text-zinc-500 border-l-2 border-violet-600 pl-3">
          <span className="text-zinc-400">Your context: </span>
          {plan.additional_context}
        </div>
      )}

      {writeProgress && <p className="text-sm text-violet-300">{writeProgress}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {activeSlots.length > 0 && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Plan schedule
                <span className="ml-2 text-sm font-normal text-zinc-500">
                  ({activeSlots.length} slots
                  {writtenSlots.length > 0 && ` · ${writtenSlots.length} ready to review`})
                </span>
              </h2>
              <p className="text-xs text-zinc-600 mt-1">
                Click a draft to view and edit. Click planned slots to select them for batch writing.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center bg-zinc-800/60 border border-zinc-700/50 rounded-lg p-0.5 gap-0.5">
                <button
                  type="button"
                  onClick={() => setScheduleView('list')}
                  title="List"
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all',
                    scheduleView === 'list'
                      ? 'bg-zinc-700 text-white shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-300',
                  )}
                >
                  <List className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">List</span>
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleView('calendar')}
                  title="Calendar"
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all',
                    scheduleView === 'calendar'
                      ? 'bg-zinc-700 text-white shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-300',
                  )}
                >
                  <CalendarDays className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Calendar</span>
                </button>
              </div>
              <Link href={`/${companyId}/calendar`} className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1">
                <CalendarClock className="w-3.5 h-3.5" />
                Open calendar
              </Link>
            </div>
          </div>

          {scheduleView === 'calendar' ? (
            <PlanSlotsCalendar
              slots={plan.slots}
              posts={posts}
              selected={selected}
              initialMonth={parseISO(plan.start_date)}
              onSlotClick={handleSlotClick}
            />
          ) : (
            <div className="space-y-2">
              {activeSlots.map(slot => {
                if (slot.status === 'written') {
                  const post = slot.post_id ? posts[slot.post_id] : undefined
                  return (
                    <WrittenSlotRow
                      key={slot.id}
                      slot={slot}
                      post={post}
                      approving={approving === slot.id}
                      onOpen={() => post && openEditor(post)}
                      onApprove={() => approveSlot(slot)}
                      onSkip={() => skipSlot(slot.id)}
                      onDelete={() => deleteSlotPost(slot)}
                      onPostUpdate={handlePostUpdate}
                    />
                  )
                }
                return (
                  <PlannedSlotRow
                    key={slot.id}
                    slot={slot}
                    selected={selected.has(slot.id)}
                    onToggle={() => toggleSlot(slot.id)}
                    onSkip={() => skipSlot(slot.id)}
                  />
                )
              })}
            </div>
          )}
        </div>
      )}

      <PostEditorModal
        post={editingPost}
        open={editorOpen}
        onOpenChange={open => { setEditorOpen(open); if (!open) setEditingPost(null) }}
        onUpdate={handlePostUpdate}
        companyId={companyId}
      />
    </div>
  )
}

// ─── Written slot row (for review/approval) ──────────────────────────────────

const BUFFER_CHANNELS = new Set<Channel>(['linkedin', 'x', 'facebook'])

function WrittenSlotRow({
  slot,
  post,
  approving,
  onOpen,
  onApprove,
  onSkip,
  onDelete,
  onPostUpdate,
}: {
  slot: ContentPlanSlot
  post?: Post
  approving: boolean
  onOpen: () => void
  onApprove: () => void
  onSkip: () => void
  onDelete: () => void
  onPostUpdate?: (post: Post) => void
}) {
  const isScheduled = post?.status === 'scheduled'
  const contentPreview = post?.content ? postBodyForPublish(post.content) : undefined
  const showBuffer = post && BUFFER_CHANNELS.has(slot.channel)
  const scheduledTime = post?.scheduled_for ?? slot.scheduled_for
  const canOpen = !!post

  return (
    <div className={cn(
      'rounded-xl border transition-colors',
      isScheduled ? 'border-green-500/30 bg-green-950/10' : 'border-zinc-800 bg-zinc-900/20',
    )}>
      <div
        role={canOpen ? 'button' : undefined}
        tabIndex={canOpen ? 0 : undefined}
        onClick={canOpen ? onOpen : undefined}
        onKeyDown={canOpen ? e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onOpen()
          }
        } : undefined}
        className={cn(
          'p-4 pb-3 transition-colors',
          canOpen && 'cursor-pointer hover:bg-zinc-800/30 rounded-t-xl',
        )}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
              {CHANNEL_ICON[slot.channel]}
              {slot.channel}
            </span>
            {isScheduled ? (
              <span className="flex items-center gap-1 text-xs text-green-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Scheduled
              </span>
            ) : (
              <Badge variant="default" className="text-[10px]">Draft ready</Badge>
            )}
            {slot.pillar && <span className="text-[10px] text-zinc-600">{slot.pillar}</span>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onSkip() }}
              title="Dismiss slot"
              className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400 transition-colors p-1"
            >
              <DismissIcon className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onDelete() }}
              title="Delete draft"
              className="flex items-center gap-1 text-xs text-zinc-600 hover:text-red-400 transition-colors p-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 mb-1.5">
          <CalendarClock className="w-3.5 h-3.5 text-violet-400 shrink-0" />
          <span className="text-xs font-medium text-zinc-300">
            Scheduled for: {format(parseISO(scheduledTime), 'EEE, MMM d yyyy · h:mm a')}
          </span>
        </div>

        <p className="text-sm font-medium text-white mb-1">{slot.topic}</p>

        {contentPreview ? (
          <p className="text-xs text-zinc-500 leading-relaxed line-clamp-2">
            {contentPreview}
          </p>
        ) : (
          <p className="text-xs text-zinc-700 italic">Loading draft…</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 pb-4">
        {!isScheduled && (
          <Button
            size="sm"
            onClick={onApprove}
            disabled={approving || !post}
            className="gap-1.5"
          >
            {approving
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <CheckCircle2 className="w-3.5 h-3.5" />
            }
            Approve &amp; schedule
          </Button>
        )}
        {showBuffer && (
          <SendToBufferButton
            postId={post.id}
            channel={slot.channel}
            scheduledFor={post.scheduled_for ?? slot.scheduled_for}
            bufferPostId={post.buffer_post_id ?? null}
            onSuccess={update => {
              onPostUpdate?.({
                ...post,
                buffer_post_id: update.buffer_post_id ?? null,
                scheduled_for: update.scheduled_for ?? post.scheduled_for,
              })
            }}
          />
        )}
        {post && (
          <RemixButton postId={post.id} channel={slot.channel} companyId={post.company_id} />
        )}
      </div>
    </div>
  )
}

// ─── Remix button ─────────────────────────────────────────────────────────────

const ALL_CHANNELS: Channel[] = ['linkedin', 'x', 'facebook', 'reddit']
const CHANNEL_LABELS: Record<Channel, string> = {
  linkedin: 'LinkedIn',
  x: 'X (Twitter)',
  facebook: 'Facebook',
  reddit: 'Reddit',
}

function RemixButton({
  postId,
  channel,
  companyId,
}: {
  postId: string
  channel: Channel
  companyId: string
}) {
  const [open, setOpen] = useState(false)
  const [remixing, setRemixing] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [targetChannel, setTargetChannel] = useState<Channel>(
    ALL_CHANNELS.find(c => c !== channel) ?? 'x',
  )

  async function handleRemix() {
    setRemixing(true)
    setError(null)
    try {
      const res = await fetch(`/api/posts/${postId}/remix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetChannel }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? 'Remix failed')
      }
      setSuccess(true)
      setTimeout(() => { setOpen(false); setSuccess(false) }, 1800)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remix failed')
    } finally {
      setRemixing(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Remix this post for another channel"
        className="flex items-center gap-1 text-xs text-zinc-500 hover:text-violet-400 transition-colors"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        Remix
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <select
        value={targetChannel}
        onChange={e => setTargetChannel(e.target.value as Channel)}
        disabled={remixing}
        className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-300 text-xs"
      >
        {ALL_CHANNELS.map(ch => (
          <option key={ch} value={ch}>
            {CHANNEL_LABELS[ch]}{ch === channel ? ' (same)' : ''}
          </option>
        ))}
      </select>
      <Button size="sm" onClick={handleRemix} disabled={remixing} className="gap-1 h-6 px-2 text-xs">
        {remixing
          ? <Loader2 className="w-3 h-3 animate-spin" />
          : success
            ? <CheckCircle2 className="w-3 h-3" />
            : <RefreshCw className="w-3 h-3" />
        }
        {success ? 'Created!' : remixing ? 'Remixing…' : 'Go'}
      </Button>
      <button
        type="button"
        onClick={() => { setOpen(false); setError(null) }}
        className="text-zinc-600 hover:text-zinc-400"
      >
        <DismissIcon className="w-3.5 h-3.5" />
      </button>
      {error && <span className="text-red-400">{error}</span>}
    </div>
  )
}

// ─── Planned slot row (for selection) ────────────────────────────────────────

function PlannedSlotRow({
  slot,
  selected,
  onToggle,
  onSkip,
}: {
  slot: ContentPlanSlot
  selected: boolean
  onToggle: () => void
  onSkip: () => void
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-xl border transition-colors',
        selected ? 'border-violet-500/50 bg-violet-950/20' : 'border-zinc-800 bg-zinc-900/20',
      )}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="mt-1 rounded border-zinc-600"
      />

      <button
        type="button"
        onClick={onToggle}
        className="flex-1 min-w-0 text-left cursor-pointer"
      >
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className={cn('flex items-center gap-1 text-xs px-1.5 py-0.5 rounded', 'bg-zinc-800 text-zinc-300')}>
            {CHANNEL_ICON[slot.channel]}
            {slot.channel}
          </span>
          <span className="text-xs text-zinc-500">
            {format(parseISO(slot.scheduled_for), 'EEE MMM d · h:mm a')}
          </span>
          <Badge variant="default" className="text-[10px]">
            {SLOT_STATUS_LABEL[slot.status] ?? slot.status}
          </Badge>
          {slot.pillar && (
            <span className="text-[10px] text-zinc-600">{slot.pillar}</span>
          )}
        </div>
        <p className="text-sm text-white font-medium">{slot.topic}</p>
        <p className="text-xs text-zinc-600 mt-0.5">
          {slot.channel === 'x' && isThreadSlot(slot.channel, slot.post_type, slot.post_length) && (
            <span className="text-violet-400 mr-1">Thread ·</span>
          )}
          {slot.channel === 'x' && !isThreadSlot(slot.channel, slot.post_type, slot.post_length) && (
            <span className="text-zinc-400 mr-1">Single ·</span>
          )}
          {slot.post_type} · {slot.content_goal} · {slot.post_length}
        </p>
        {slot.notes && <p className="text-xs text-zinc-500 mt-1">{slot.notes}</p>}
      </button>

      <button
        type="button"
        onClick={onSkip}
        title="Dismiss this slot"
        className="flex items-center gap-1 text-xs text-zinc-700 hover:text-red-400 transition-colors shrink-0 mt-0.5"
      >
        <DismissIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
