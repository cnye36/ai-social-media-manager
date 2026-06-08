'use client'

import { useState } from 'react'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, isSameMonth, isToday,
  addMonths, subMonths, isSameDay,
} from 'date-fns'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { calendarDisplayAt } from '@/lib/content-status'
import { postBodyForPublish } from '@/lib/generate/image-prompt'
import type { Post } from '@/types/database'

interface PostsMiniCalendarProps {
  posts: Post[]
  onEdit: (post: Post) => void
  chipBg: string
  chipText: string
  chipIcon: React.ReactNode
}

interface CalItem { post: Post; time: Date }

export function PostsMiniCalendar({ posts, onEdit, chipBg, chipText, chipIcon }: PostsMiniCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [overflowItems, setOverflowItems] = useState<CalItem[]>([])
  const [overflowDay, setOverflowDay] = useState<Date | null>(null)

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  function itemsForDay(day: Date): CalItem[] {
    return posts.flatMap(p => {
      const at = calendarDisplayAt(p)
      if (!at || !isSameDay(at, day)) return []
      return [{ post: p, time: at }]
    }).sort((a, b) => a.time.getTime() - b.time.getTime())
  }

  const scheduledCount = posts.filter(p => p.status === 'scheduled' && p.scheduled_for).length

  return (
    <div className="space-y-3">
      {/* Month nav */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentMonth(m => subMonths(m, 1))}
            className="p-1 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-white w-32 text-center">
            {format(currentMonth, 'MMMM yyyy')}
          </span>
          <button
            onClick={() => setCurrentMonth(m => addMonths(m, 1))}
            className="p-1 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <span className="text-xs text-zinc-500">
          <span className="text-white font-medium">{scheduledCount}</span> scheduled
        </span>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
          <div key={d} className="text-center text-[10px] text-zinc-600 font-medium py-1">{d}</div>
        ))}
      </div>

      {/* Grid */}
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
                'min-h-[80px] border-r border-b border-zinc-800 p-1.5',
                !inMonth && 'bg-zinc-950/50',
                isCurrentDay && 'bg-violet-950/20'
              )}
            >
              <div className="flex justify-end mb-1">
                <span className={cn(
                  'text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-medium',
                  isCurrentDay ? 'bg-violet-600 text-white' : inMonth ? 'text-zinc-500' : 'text-zinc-700'
                )}>
                  {format(day, 'd')}
                </span>
              </div>
              <div className="space-y-0.5">
                {items.slice(0, 2).map(({ post, time }) => (
                  <button
                    key={post.id}
                    onClick={() => onEdit(post)}
                    className={cn(
                      'w-full flex items-center gap-0.5 px-1 py-0.5 rounded text-left transition-opacity hover:opacity-80',
                      chipBg, chipText
                    )}
                  >
                    {chipIcon}
                    <span className="text-[9px] truncate leading-tight">
                      <span className="font-medium mr-0.5">{format(time, 'h:mma')}</span>
                      {postBodyForPublish(post.content).slice(0, 15)}
                    </span>
                  </button>
                ))}
                {overflow > 0 && (
                  <button
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

      {/* Overflow dialog */}
      <Dialog open={!!overflowDay} onOpenChange={open => { if (!open) setOverflowDay(null) }}>
        <DialogContent className="max-w-sm p-0 overflow-hidden">
          <DialogTitle className="sr-only">
            {overflowDay ? format(overflowDay, 'EEEE, MMMM d') : 'Posts'}
          </DialogTitle>
          <DialogDescription className="sr-only">All posts scheduled for this day</DialogDescription>
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <p className="text-sm font-semibold text-white">
              {overflowDay ? format(overflowDay, 'EEEE, MMMM d') : ''}
            </p>
            <button onClick={() => setOverflowDay(null)} className="text-zinc-500 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="divide-y divide-zinc-800 max-h-80 overflow-y-auto">
            {overflowItems.map(({ post, time }) => (
              <button
                key={post.id}
                onClick={() => { setOverflowDay(null); onEdit(post) }}
                className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-zinc-800/50 transition-colors"
              >
                <span className={cn('flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded mt-0.5 shrink-0', chipBg, chipText)}>
                  {chipIcon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-zinc-500 mb-0.5">{format(time, 'h:mm a')}</p>
                  <p className="text-xs text-zinc-300 line-clamp-2">{postBodyForPublish(post.content)}</p>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
