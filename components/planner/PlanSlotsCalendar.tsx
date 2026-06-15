'use client'

import { useState } from 'react'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, isSameMonth, isToday,
  addMonths, subMonths, isSameDay, parseISO,
} from 'date-fns'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { LinkedInIcon, XIcon, RedditIcon, FacebookIcon } from '@/components/ui/channel-icons'
import { postBodyForPublish } from '@/lib/generate/image-prompt'
import type { Channel, Post } from '@/types/database'
import type { ContentPlanSlot } from '@/types/content-planning'

const CHANNEL_CHIP: Record<Channel, { bg: string; text: string; icon: React.ReactNode }> = {
  linkedin: { bg: 'bg-blue-500/15', text: 'text-blue-300', icon: <LinkedInIcon className="w-2.5 h-2.5" /> },
  x: { bg: 'bg-zinc-500/15', text: 'text-zinc-300', icon: <XIcon className="w-2.5 h-2.5" /> },
  reddit: { bg: 'bg-orange-500/15', text: 'text-orange-300', icon: <RedditIcon className="w-2.5 h-2.5" /> },
  facebook: { bg: 'bg-blue-400/15', text: 'text-blue-300', icon: <FacebookIcon className="w-2.5 h-2.5" /> },
}

interface CalItem {
  slot: ContentPlanSlot
  time: Date
  post?: Post
}

interface PlanSlotsCalendarProps {
  slots: ContentPlanSlot[]
  posts: Record<string, Post>
  selected: Set<string>
  initialMonth: Date
  onSlotClick: (slot: ContentPlanSlot, post?: Post) => void
}

export function PlanSlotsCalendar({
  slots,
  posts,
  selected,
  initialMonth,
  onSlotClick,
}: PlanSlotsCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(initialMonth)
  const [overflowItems, setOverflowItems] = useState<CalItem[]>([])
  const [overflowDay, setOverflowDay] = useState<Date | null>(null)

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  const activeSlots = slots.filter(s => s.status !== 'skipped')

  function itemsForDay(day: Date): CalItem[] {
    return activeSlots.flatMap(slot => {
      const time = parseISO(slot.scheduled_for)
      if (!isSameDay(time, day)) return []
      const post = slot.post_id ? posts[slot.post_id] : undefined
      return [{ slot, time, post }]
    }).sort((a, b) => a.time.getTime() - b.time.getTime())
  }

  const writtenCount = activeSlots.filter(s => s.status === 'written').length
  const plannedCount = activeSlots.filter(s => s.status === 'planned').length

  function slotLabel(item: CalItem): string {
    if (item.post?.content) {
      return postBodyForPublish(item.post.content).slice(0, 20)
    }
    return item.slot.topic.slice(0, 20)
  }

  function slotChipStyle(item: CalItem): string {
    const chip = CHANNEL_CHIP[item.slot.channel]
    if (item.post?.status === 'scheduled') {
      return cn(chip.bg, chip.text, 'ring-1 ring-green-500/40')
    }
    if (item.slot.status === 'written') {
      return cn(chip.bg, chip.text)
    }
    if (selected.has(item.slot.id)) {
      return cn(chip.bg, chip.text, 'ring-1 ring-violet-500/60')
    }
    return cn(chip.bg, chip.text, 'opacity-70 border border-dashed border-zinc-600/50')
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCurrentMonth(m => subMonths(m, 1))}
            className="p-1 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-white w-32 text-center">
            {format(currentMonth, 'MMMM yyyy')}
          </span>
          <button
            type="button"
            onClick={() => setCurrentMonth(m => addMonths(m, 1))}
            className="p-1 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <span className="text-xs text-zinc-500">
          <span className="text-white font-medium">{writtenCount}</span> written
          {' · '}
          <span className="text-white font-medium">{plannedCount}</span> planned
        </span>
      </div>

      <div className="grid grid-cols-7">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
          <div key={d} className="text-center text-[10px] text-zinc-600 font-medium py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 border-l border-t border-zinc-800 rounded-xl overflow-hidden">
        {days.map(day => {
          const items = itemsForDay(day)
          const inMonth = isSameMonth(day, currentMonth)
          const isCurrentDay = isToday(day)
          const overflow = items.length - 2

          return (
            <div
              key={day.toISOString()}
              className={cn(
                'min-h-[88px] border-r border-b border-zinc-800 p-1.5',
                !inMonth && 'bg-zinc-950/50',
                isCurrentDay && 'bg-violet-950/20',
              )}
            >
              <div className="flex justify-end mb-1">
                <span className={cn(
                  'text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-medium',
                  isCurrentDay ? 'bg-violet-600 text-white' : inMonth ? 'text-zinc-500' : 'text-zinc-700',
                )}>
                  {format(day, 'd')}
                </span>
              </div>
              <div className="space-y-0.5">
                {items.slice(0, 2).map(item => {
                  const chip = CHANNEL_CHIP[item.slot.channel]
                  return (
                    <button
                      key={item.slot.id}
                      type="button"
                      onClick={() => onSlotClick(item.slot, item.post)}
                      className={cn(
                        'w-full flex items-center gap-0.5 px-1 py-0.5 rounded text-left transition-opacity hover:opacity-80',
                        slotChipStyle(item),
                      )}
                      title={item.slot.topic}
                    >
                      {chip.icon}
                      <span className="text-[9px] truncate leading-tight min-w-0">
                        <span className="font-medium mr-0.5">{format(item.time, 'h:mma')}</span>
                        {slotLabel(item)}
                      </span>
                    </button>
                  )
                })}
                {overflow > 0 && (
                  <button
                    type="button"
                    onClick={() => { setOverflowDay(day); setOverflowItems(items) }}
                    className="text-[9px] text-violet-400 hover:text-violet-300 px-1 transition-colors"
                  >
                    +{overflow} more
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-zinc-500">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded border border-dashed border-zinc-600/50 bg-zinc-800/50" />
          Planned
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-violet-500/20 ring-1 ring-violet-500/40" />
          Draft ready
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-green-500/20 ring-1 ring-green-500/40" />
          Scheduled
        </div>
      </div>

      <Dialog open={!!overflowDay} onOpenChange={open => { if (!open) setOverflowDay(null) }}>
        <DialogContent className="max-w-sm p-0 overflow-hidden">
          <DialogTitle className="sr-only">
            {overflowDay ? format(overflowDay, 'EEEE, MMMM d') : 'Plan slots'}
          </DialogTitle>
          <DialogDescription className="sr-only">All plan slots scheduled for this day</DialogDescription>
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <p className="text-sm font-semibold text-white">
              {overflowDay ? format(overflowDay, 'EEEE, MMMM d') : ''}
            </p>
            <button
              type="button"
              onClick={() => setOverflowDay(null)}
              className="text-zinc-500 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="divide-y divide-zinc-800 max-h-80 overflow-y-auto">
            {overflowItems.map(item => {
              const chip = CHANNEL_CHIP[item.slot.channel]
              return (
                <button
                  key={item.slot.id}
                  type="button"
                  onClick={() => { setOverflowDay(null); onSlotClick(item.slot, item.post) }}
                  className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-zinc-800/50 transition-colors"
                >
                  <span className={cn(
                    'flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded mt-0.5 shrink-0',
                    chip.bg, chip.text,
                  )}>
                    {chip.icon}
                    {item.slot.channel}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-zinc-500 mb-0.5">{format(item.time, 'h:mm a')}</p>
                    <p className="text-xs font-medium text-white truncate">{item.slot.topic}</p>
                    {item.post?.content && (
                      <p className="text-xs text-zinc-400 line-clamp-2 mt-0.5">
                        {postBodyForPublish(item.post.content)}
                      </p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
