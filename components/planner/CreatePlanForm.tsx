'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { addDays, addMonths, format, startOfWeek } from 'date-fns'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { LinkedInIcon, XIcon, RedditIcon, FacebookIcon } from '@/components/ui/channel-icons'
import { cn } from '@/lib/utils'
import type { Channel } from '@/types/database'
import type { ContentPlan } from '@/types/content-planning'

const CHANNELS: { id: Channel; label: string; icon: React.ReactNode }[] = [
  { id: 'linkedin', label: 'LinkedIn', icon: <LinkedInIcon className="w-4 h-4" /> },
  { id: 'x', label: 'X', icon: <XIcon className="w-4 h-4" /> },
  { id: 'facebook', label: 'Facebook', icon: <FacebookIcon className="w-4 h-4" /> },
  { id: 'reddit', label: 'Reddit', icon: <RedditIcon className="w-4 h-4" /> },
]

type RangePreset = 'week' | 'month'

interface CreatePlanFormProps {
  companyId: string
  onCreated?: (plan: ContentPlan) => void
  onCancel?: () => void
}

export function CreatePlanForm({ companyId, onCreated, onCancel }: CreatePlanFormProps) {
  const router = useRouter()
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  const [name, setName] = useState(`Content plan · ${format(new Date(), 'MMM yyyy')}`)
  const [preset, setPreset] = useState<RangePreset>('month')
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(addMonths(new Date(), 1), 'yyyy-MM-dd'))
  const [channels, setChannels] = useState<Channel[]>(['linkedin', 'x'])
  const [additionalContext, setAdditionalContext] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function applyPreset(p: RangePreset) {
    setPreset(p)
    if (p === 'week') {
      const start = format(weekStart, 'yyyy-MM-dd')
      const end = format(addDays(weekStart, 6), 'yyyy-MM-dd')
      setStartDate(start)
      setEndDate(end)
      setName(`Week of ${format(weekStart, 'MMM d')}`)
    } else {
      const start = format(new Date(), 'yyyy-MM-dd')
      const end = format(addMonths(new Date(), 1), 'yyyy-MM-dd')
      setStartDate(start)
      setEndDate(end)
      setName(`Content plan · ${format(new Date(), 'MMM yyyy')}`)
    }
  }

  function toggleChannel(ch: Channel) {
    setChannels(prev =>
      prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch],
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!channels.length) {
      setError('Select at least one channel')
      return
    }
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/content-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          name,
          startDate,
          endDate,
          channels,
          additionalContext: additionalContext.trim() || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create plan')

      const slots = data.content_plan_slots ?? []
      const plan: ContentPlan = {
        ...data,
        slots: undefined,
      }

      if (onCreated) {
        onCreated(plan)
      }
      router.push(`/${companyId}/planner/${plan.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <h2 className="text-lg font-semibold text-white">New content plan</h2>

      <div className="flex gap-2">
        {(['week', 'month'] as RangePreset[]).map(p => (
          <button
            key={p}
            type="button"
            onClick={() => applyPreset(p)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm border transition-colors',
              preset === p
                ? 'border-violet-500 bg-violet-600/15 text-violet-300'
                : 'border-zinc-700 text-zinc-400 hover:border-zinc-600',
            )}
          >
            {p === 'week' ? 'This week' : 'Next month'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="plan-name">Plan name</Label>
          <input
            id="plan-name"
            value={name}
            onChange={e => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="start">Start</Label>
            <input
              id="start"
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
              required
            />
          </div>
          <div>
            <Label htmlFor="end">End</Label>
            <input
              id="end"
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
              required
            />
          </div>
        </div>
      </div>

      <div>
        <Label>Channels</Label>
        <div className="flex flex-wrap gap-2 mt-2">
          {CHANNELS.map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => toggleChannel(id)}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border transition-colors',
                channels.includes(id)
                  ? 'border-violet-500 bg-violet-600/15 text-violet-300'
                  : 'border-zinc-700 text-zinc-400 hover:border-zinc-600',
              )}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label htmlFor="context">What should we talk about? (optional)</Label>
        <Textarea
          id="context"
          value={additionalContext}
          onChange={e => setAdditionalContext(e.target.value)}
          placeholder='e.g. "We launched a new API integration" or "Focus on customer success stories this month"'
          className="mt-1 min-h-[80px]"
        />
        <p className="text-xs text-zinc-600 mt-1">
          The planner uses your brand profile, knowledge base, and past scheduled posts. Add timely
          context here for one-off announcements mixed with recurring pillars.
        </p>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Building your plan…
            </>
          ) : (
            'Generate plan'
          )}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
        )}
      </div>

      {loading && (
        <p className="text-xs text-zinc-500">
          Analyzing your posting history and brand data — this may take a minute.
        </p>
      )}
    </form>
  )
}
