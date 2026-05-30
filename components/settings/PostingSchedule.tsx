'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, Clock, BarChart3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LinkedInIcon, XIcon, FacebookIcon } from '@/components/ui/channel-icons'
import { cn } from '@/lib/utils'
import { DAY_NAMES, CHANNEL_FREQUENCY_LABELS, bufferDaysCoverage } from '@/lib/scheduling/defaults'
import type { Channel } from '@/types/database'

const CHANNELS: { id: Channel; label: string; icon: React.ReactNode }[] = [
  { id: 'linkedin', label: 'LinkedIn', icon: <LinkedInIcon className="w-4 h-4" /> },
  { id: 'x',       label: 'X / Twitter', icon: <XIcon className="w-4 h-4" /> },
  { id: 'facebook', label: 'Facebook', icon: <FacebookIcon className="w-4 h-4" /> },
]

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
]

interface SlotEntry {
  day_of_week: number
  hour: number
  minute: number
  timezone: string
  enabled: boolean
}

type Schedules = Partial<Record<Channel, SlotEntry[]>>

interface QueueStatus {
  inQueue: number
  pending: number
  limit: number
}

function formatSlot(slot: SlotEntry): string {
  const h = slot.hour % 12 || 12
  const m = String(slot.minute).padStart(2, '0')
  const ampm = slot.hour < 12 ? 'AM' : 'PM'
  return `${DAY_NAMES[slot.day_of_week]} ${h}:${m} ${ampm}`
}

export function PostingSchedule({ companyId }: { companyId: string }) {
  const [activeChannel, setActiveChannel] = useState<Channel>('linkedin')
  const [schedules, setSchedules] = useState<Schedules>({})
  const [queueStatus, setQueueStatus] = useState<Partial<Record<Channel, QueueStatus>>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [timezone, setTimezone] = useState('America/New_York')

  // Add slot form state
  const [newDay, setNewDay] = useState(1)
  const [newHour, setNewHour] = useState(9)
  const [newMinute, setNewMinute] = useState(0)

  useEffect(() => {
    Promise.all([
      fetch(`/api/scheduling/channel-schedules?companyId=${companyId}`).then(r => r.json()),
      fetch(`/api/buffer/queue-status?companyId=${companyId}`).then(r => r.json()).catch(() => ({})),
    ]).then(([sched, queue]) => {
      setSchedules(sched as Schedules)
      setQueueStatus(queue as Partial<Record<Channel, QueueStatus>>)
      // Infer timezone from first available schedule
      const allSlots = Object.values(sched as Schedules).flat().filter(Boolean) as SlotEntry[]
      if (allSlots.length > 0) setTimezone(allSlots[0].timezone)
      setLoading(false)
    })
  }, [companyId])

  const currentSlots: SlotEntry[] = (schedules[activeChannel] ?? [])
    .sort((a, b) => a.day_of_week * 10000 + a.hour * 100 + a.minute - (b.day_of_week * 10000 + b.hour * 100 + b.minute))

  function addSlot() {
    const exists = currentSlots.some(
      s => s.day_of_week === newDay && s.hour === newHour && s.minute === newMinute
    )
    if (exists) return
    setSchedules(prev => ({
      ...prev,
      [activeChannel]: [
        ...(prev[activeChannel] ?? []),
        { day_of_week: newDay, hour: newHour, minute: newMinute, timezone, enabled: true },
      ],
    }))
  }

  function removeSlot(index: number) {
    setSchedules(prev => ({
      ...prev,
      [activeChannel]: (prev[activeChannel] ?? []).filter((_, i) => i !== index),
    }))
  }

  async function saveSchedule() {
    setSaving(true)
    setSaveMsg('')
    const res = await fetch('/api/scheduling/channel-schedules', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId,
        channel: activeChannel,
        slots: currentSlots.map(s => ({ ...s, timezone })),
      }),
    })
    setSaving(false)
    setSaveMsg(res.ok ? 'Saved!' : 'Save failed')
    setTimeout(() => setSaveMsg(''), 2500)
  }

  if (loading) {
    return <div className="h-48 rounded-xl bg-zinc-800/50 animate-pulse" />
  }

  const channelQueue = queueStatus[activeChannel]

  return (
    <div className="space-y-5">
      {/* Channel tabs */}
      <div className="flex gap-2">
        {CHANNELS.map(ch => (
          <button
            key={ch.id}
            onClick={() => setActiveChannel(ch.id)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              activeChannel === ch.id
                ? 'bg-violet-600/20 text-violet-300 border border-violet-500/40'
                : 'text-zinc-400 hover:text-white border border-transparent'
            )}
          >
            {ch.icon}
            {ch.label}
          </button>
        ))}
      </div>

      {/* Frequency + queue status */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 px-4 py-3 rounded-lg bg-zinc-800/60 border border-zinc-700 text-sm space-y-1">
          <p className="text-zinc-400 text-xs uppercase tracking-wide font-medium">Cadence</p>
          <p className="text-white font-medium">{CHANNEL_FREQUENCY_LABELS[activeChannel] ?? '—'}</p>
          <p className="text-zinc-500 text-xs">
            10 Buffer slots ≈{' '}
            <span className="text-zinc-300">{bufferDaysCoverage(activeChannel)} day{bufferDaysCoverage(activeChannel) !== 1 ? 's' : ''}</span>
            {' '}of queue coverage at this frequency
          </p>
        </div>
        {channelQueue && (
          <div className="flex-1 px-4 py-3 rounded-lg bg-zinc-800/60 border border-zinc-700 text-sm space-y-1">
            <p className="text-zinc-400 text-xs uppercase tracking-wide font-medium flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5" /> Buffer queue
            </p>
            <p>
              <span className="text-white font-semibold">{channelQueue.inQueue}</span>
              <span className="text-zinc-500"> / {channelQueue.limit} slots used</span>
            </p>
            {channelQueue.pending > 0 && (
              <p className="text-violet-400 text-xs">
                +{channelQueue.pending} post{channelQueue.pending !== 1 ? 's' : ''} waiting to be queued
              </p>
            )}
          </div>
        )}
      </div>

      {/* Timezone selector */}
      <div className="flex items-center gap-3">
        <Clock className="w-4 h-4 text-zinc-500 flex-shrink-0" />
        <select
          value={timezone}
          onChange={e => {
            const tz = e.target.value
            setTimezone(tz)
            setSchedules(prev => ({
              ...prev,
              [activeChannel]: (prev[activeChannel] ?? []).map(s => ({ ...s, timezone: tz })),
            }))
          }}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500/60"
        >
          {TIMEZONES.map(tz => (
            <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      {/* Slot list */}
      <div className="space-y-2">
        <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium">
          Posting slots — {currentSlots.length} configured
        </p>
        {currentSlots.length === 0 ? (
          <p className="text-sm text-zinc-600 italic">No slots configured. Add some below.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {currentSlots.map((slot, i) => (
              <div
                key={i}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm"
              >
                <span className="text-zinc-300">{formatSlot(slot)}</span>
                <button
                  onClick={() => removeSlot(i)}
                  className="text-zinc-600 hover:text-red-400 transition-colors ml-2"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add slot */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1">
          <label className="text-xs text-zinc-500">Day</label>
          <select
            value={newDay}
            onChange={e => setNewDay(parseInt(e.target.value))}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500/60"
          >
            {DAY_NAMES.map((d, i) => (
              <option key={i} value={i}>{d}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-zinc-500">Hour</label>
          <select
            value={newHour}
            onChange={e => setNewHour(parseInt(e.target.value))}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500/60"
          >
            {Array.from({ length: 24 }, (_, i) => {
              const h = i % 12 || 12
              const ampm = i < 12 ? 'AM' : 'PM'
              return <option key={i} value={i}>{h}:00 {ampm}</option>
            })}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-zinc-500">Minute</label>
          <select
            value={newMinute}
            onChange={e => setNewMinute(parseInt(e.target.value))}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500/60"
          >
            {[0, 15, 30, 45].map(m => (
              <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
            ))}
          </select>
        </div>
        <Button size="sm" variant="outline" onClick={addSlot}>
          <Plus className="w-3.5 h-3.5" />
          Add slot
        </Button>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3 pt-2">
        <Button onClick={saveSchedule} disabled={saving}>
          {saving ? 'Saving…' : 'Save schedule'}
        </Button>
        {saveMsg && (
          <span className={cn('text-sm', saveMsg === 'Saved!' ? 'text-green-400' : 'text-red-400')}>
            {saveMsg}
          </span>
        )}
      </div>
    </div>
  )
}
