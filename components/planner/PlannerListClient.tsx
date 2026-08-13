'use client'

import { useState } from 'react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { CalendarRange, ChevronRight, Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CreatePlanForm } from './CreatePlanForm'
import type { ContentPlan } from '@/types/content-planning'

const STATUS_LABELS: Record<string, string> = {
  planning: 'Planning…',
  planned: 'Ready to write',
  writing: 'Writing posts',
  ready: 'All written',
  archived: 'Archived',
}

interface PlannerListClientProps {
  companyId: string
  initialPlans: ContentPlan[]
}

export function PlannerListClient({ companyId, initialPlans }: PlannerListClientProps) {
  const [plans, setPlans] = useState(initialPlans)
  const [showCreate, setShowCreate] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function handleCreated(plan: ContentPlan) {
    setPlans(prev => [plan, ...prev])
    setShowCreate(false)
  }

  async function handleDelete(plan: ContentPlan) {
    if (!confirm('Delete this plan and its unpublished drafts? Scheduled posts stay. This cannot be undone.')) {
      return
    }
    setDeletingId(plan.id)
    const res = await fetch(`/api/content-plans/${plan.id}`, { method: 'DELETE' })
    if (res.ok) {
      setPlans(prev => prev.filter(p => p.id !== plan.id))
    }
    setDeletingId(null)
  }

  return (
    <>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <CalendarRange className="w-7 h-7 text-violet-400" />
            Content Planner
          </h1>
          <p className="text-zinc-400 mt-1 text-sm max-w-xl">
            Pick a start and end date and we&apos;ll map posts onto your posting-schedule time slots
            — using your brand, past scheduled content, and any updates you want to highlight.
            Write posts in batches, then add media and schedule from Posts or Calendar.
          </p>
        </div>
        <Button onClick={() => setShowCreate(v => !v)}>
          <Plus className="w-4 h-4" />
          New plan
        </Button>
      </div>

      {showCreate && (
        <div className="mb-8 border border-zinc-800 rounded-xl p-6 bg-zinc-900/50">
          <CreatePlanForm
            companyId={companyId}
            onCreated={handleCreated}
            onCancel={() => setShowCreate(false)}
          />
        </div>
      )}

      {plans.length === 0 && !showCreate ? (
        <div className="border border-dashed border-zinc-800 rounded-xl p-12 text-center">
          <CalendarRange className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-400 text-sm">No content plans yet.</p>
          <p className="text-zinc-600 text-xs mt-1">
            Create your first plan to map out recurring pillars and batch-generate drafts.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map(plan => (
            <div
              key={plan.id}
              className="flex items-center justify-between gap-4 p-4 rounded-xl border border-zinc-800 bg-zinc-900/30 hover:bg-zinc-900/60 transition-colors group"
            >
              <Link
                href={`/${companyId}/planner/${plan.id}`}
                className="min-w-0 flex-1"
              >
                <p className="font-medium text-white truncate">{plan.name}</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {format(parseISO(plan.start_date), 'MMM d')} –{' '}
                  {format(parseISO(plan.end_date), 'MMM d, yyyy')}
                  {' · '}
                  {plan.channels.join(', ')}
                </p>
                {plan.strategy_summary && (
                  <p className="text-xs text-zinc-600 mt-1 line-clamp-1">{plan.strategy_summary}</p>
                )}
              </Link>
              <div className="flex items-center gap-2 shrink-0">
                {plan.status === 'planning' ? (
                  <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
                ) : (
                  <Badge variant="default">{STATUS_LABELS[plan.status] ?? plan.status}</Badge>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(plan)}
                  disabled={deletingId === plan.id}
                  title="Delete plan"
                  className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-900/20 transition-colors disabled:opacity-40"
                >
                  {deletingId === plan.id
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Trash2 className="w-4 h-4" />}
                </button>
                <Link href={`/${companyId}/planner/${plan.id}`} aria-hidden>
                  <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
