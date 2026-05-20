'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import {
  ArrowLeft, CalendarClock, Loader2, PenLine, Sparkles, CheckCircle2, Eye,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PostEditorModal } from '@/components/posts/PostEditorModal'
import { LinkedInIcon, XIcon, RedditIcon, FacebookIcon } from '@/components/ui/channel-icons'
import { cn } from '@/lib/utils'
import { CHANNEL_PLAYBOOKS, isThreadSlot } from '@/lib/content-planning/channel-playbook'
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

  const plannedSlots = plan.slots.filter(s => s.status === 'planned')
  const writtenSlots = plan.slots.filter(s => s.status === 'written')
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
        body: JSON.stringify({ status: 'scheduled' }),
      })
      if (res.ok) {
        const updated: Post = await res.json()
        setPosts(prev => ({ ...prev, [slot.post_id!]: updated }))
      }
    } finally {
      setApproving(null)
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

      {/* Written drafts — approval section */}
      {writtenSlots.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">
              Review drafts
              <span className="ml-2 text-sm font-normal text-zinc-500">({writtenSlots.length} ready)</span>
            </h2>
            <Link href={`/${companyId}/calendar`} className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1">
              <CalendarClock className="w-3.5 h-3.5" />
              Open calendar
            </Link>
          </div>
          <p className="text-xs text-zinc-600 mb-4">
            Review and edit each draft, then approve the ones you want to schedule.
          </p>
          <div className="space-y-3">
            {writtenSlots.map(slot => {
              const post = slot.post_id ? posts[slot.post_id] : undefined
              return (
                <WrittenSlotRow
                  key={slot.id}
                  slot={slot}
                  post={post}
                  approving={approving === slot.id}
                  onEdit={() => post && openEditor(post)}
                  onApprove={() => approveSlot(slot)}
                />
              )
            })}
          </div>
        </div>
      )}

      {/* Planned slots — selection section */}
      {plannedSlots.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">
              Schedule slots
              <span className="ml-2 text-sm font-normal text-zinc-500">({plannedSlots.length} planned)</span>
            </h2>
          </div>
          <div className="space-y-2">
            {plannedSlots.map(slot => (
              <PlannedSlotRow
                key={slot.id}
                slot={slot}
                selected={selected.has(slot.id)}
                onToggle={() => toggleSlot(slot.id)}
              />
            ))}
          </div>
        </div>
      )}

      {plannedSlots.length === 0 && writtenSlots.length === 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-white mb-4">
            All slots ({plan.slots.length})
          </h2>
          {plan.slots.map(slot => (
            <PlannedSlotRow
              key={slot.id}
              slot={slot}
              selected={selected.has(slot.id)}
              onToggle={() => toggleSlot(slot.id)}
            />
          ))}
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

function WrittenSlotRow({
  slot,
  post,
  approving,
  onEdit,
  onApprove,
}: {
  slot: ContentPlanSlot
  post?: Post
  approving: boolean
  onEdit: () => void
  onApprove: () => void
}) {
  const isScheduled = post?.status === 'scheduled'
  const contentPreview = post?.content?.split('\n--\nIMAGE_PROMPT:')[0]?.trim()

  return (
    <div className={cn(
      'rounded-xl border p-4 transition-colors',
      isScheduled ? 'border-green-500/30 bg-green-950/10' : 'border-zinc-800 bg-zinc-900/20',
    )}>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
          {CHANNEL_ICON[slot.channel]}
          {slot.channel}
        </span>
        <span className="text-xs text-zinc-500">
          {format(parseISO(slot.scheduled_for), 'EEE MMM d · h:mm a')}
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

      <p className="text-sm font-medium text-white mb-1">{slot.topic}</p>

      {contentPreview ? (
        <p className="text-xs text-zinc-500 leading-relaxed line-clamp-2 mb-3">
          {contentPreview}
        </p>
      ) : (
        <p className="text-xs text-zinc-700 italic mb-3">Loading draft…</p>
      )}

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={onEdit}
          disabled={!post}
          className="gap-1.5"
        >
          <Eye className="w-3.5 h-3.5" />
          View &amp; edit
        </Button>
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
      </div>
    </div>
  )
}

// ─── Planned slot row (for selection) ────────────────────────────────────────

function PlannedSlotRow({
  slot,
  selected,
  onToggle,
}: {
  slot: ContentPlanSlot
  selected: boolean
  onToggle: () => void
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

      <div className="flex-1 min-w-0">
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
      </div>
    </div>
  )
}
