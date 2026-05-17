'use client'

import { useEffect, useState } from 'react'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, isToday,
  addMonths, subMonths, format,
} from 'date-fns'
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScheduleModal } from '@/components/posts/ScheduleModal'
import type { Channel, Post, PostStatus } from '@/types/database'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function CalendarView({ companyId }: { companyId: string }) {
  const [month, setMonth] = useState(new Date())
  const [posts, setPosts] = useState<Post[]>([])
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [scheduleTarget, setScheduleTarget] = useState<Post | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    fetch(`/api/posts?companyId=${companyId}`)
      .then(r => r.json())
      .then(d => setPosts((d as { posts: Post[] }).posts ?? []))
  }, [companyId])

  function handleScheduled(updated: Post) {
    setPosts(prev => prev.map(p => p.id === updated.id ? updated : p))
  }

  // Build the 6-row grid covering the full month
  const gridStart = startOfWeek(startOfMonth(month))
  const gridEnd = endOfWeek(endOfMonth(month))
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })

  // Posts that have a scheduled_for date (scheduled or published)
  const calendarPosts = posts.filter(
    p => p.scheduled_for && (p.status === 'scheduled' || p.status === 'published')
  )

  function postsForDay(day: Date) {
    return calendarPosts.filter(p => isSameDay(new Date(p.scheduled_for!), day))
  }

  const selectedPosts = selectedDay ? postsForDay(selectedDay) : []
  // Also show drafts in the side panel for scheduling
  const draftPosts = posts.filter(p => p.status === 'draft')

  return (
    <div className="flex gap-6">
      {/* Calendar grid */}
      <div className="flex-1 min-w-0">
        {/* Navigation */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">
            {format(month, 'MMMM yyyy')}
          </h2>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setMonth(subMonths(month, 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMonth(new Date())}>
              Today
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMonth(addMonths(month, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map(d => (
            <div key={d} className="text-center text-xs font-medium text-zinc-500 py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-px bg-zinc-800 rounded-xl overflow-hidden border border-zinc-800">
          {days.map(day => {
            const dayPosts = postsForDay(day)
            const inMonth = isSameMonth(day, month)
            const selected = selectedDay && isSameDay(day, selectedDay)
            const today = isToday(day)

            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelectedDay(isSameDay(day, selectedDay ?? new Date(0)) ? null : day)}
                className={`bg-zinc-900 min-h-[80px] p-1.5 text-left transition-colors hover:bg-zinc-800/80 ${
                  selected ? 'ring-1 ring-inset ring-violet-500' : ''
                }`}
              >
                <span
                  className={`text-xs font-medium mb-1 flex items-center justify-center w-6 h-6 rounded-full ${
                    today
                      ? 'bg-violet-600 text-white'
                      : inMonth
                      ? 'text-zinc-300'
                      : 'text-zinc-700'
                  }`}
                >
                  {format(day, 'd')}
                </span>
                <div className="space-y-0.5">
                  {dayPosts.slice(0, 3).map(post => (
                    <div
                      key={post.id}
                      className={`text-xs px-1.5 py-0.5 rounded truncate ${
                        post.channel === 'linkedin' ? 'bg-blue-600/25 text-blue-300' :
                        post.channel === 'x' ? 'bg-zinc-600/40 text-zinc-300' :
                        post.channel === 'reddit' ? 'bg-orange-600/25 text-orange-300' :
                        'bg-blue-400/20 text-blue-200'
                      }`}
                    >
                      {post.channel}
                    </div>
                  ))}
                  {dayPosts.length > 3 && (
                    <div className="text-xs text-zinc-600 px-1">+{dayPosts.length - 3}</div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Side panel */}
      <div className="w-72 flex-shrink-0 space-y-4">
        {/* Selected day detail */}
        {selectedDay && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-3">
              {format(selectedDay, 'EEEE, MMMM d')}
            </h3>
            {selectedPosts.length === 0 ? (
              <p className="text-xs text-zinc-500">No posts scheduled.</p>
            ) : (
              <div className="space-y-3">
                {selectedPosts.map(post => (
                  <div key={post.id} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Badge variant={post.channel as Channel}>{post.channel}</Badge>
                      <Badge variant={post.status as PostStatus}>{post.status}</Badge>
                    </div>
                    <p className="text-xs text-zinc-400 line-clamp-3">{post.content}</p>
                    {post.scheduled_for && (
                      <p className="flex items-center gap-1 text-xs text-yellow-400">
                        <Clock className="w-3 h-3" />
                        {format(new Date(post.scheduled_for), 'h:mm a')}
                      </p>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-xs"
                      onClick={() => { setScheduleTarget(post); setModalOpen(true) }}
                    >
                      Reschedule
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Unscheduled drafts */}
        {draftPosts.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-3">
              Unscheduled drafts ({draftPosts.length})
            </h3>
            <div className="space-y-3">
              {draftPosts.slice(0, 5).map(post => (
                <div key={post.id} className="space-y-1.5">
                  <Badge variant={post.channel as Channel}>{post.channel}</Badge>
                  <p className="text-xs text-zinc-400 line-clamp-2">{post.content}</p>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-full text-xs"
                    onClick={() => { setScheduleTarget(post); setModalOpen(true) }}
                  >
                    Schedule
                  </Button>
                </div>
              ))}
              {draftPosts.length > 5 && (
                <p className="text-xs text-zinc-600 text-center">+{draftPosts.length - 5} more in Posts</p>
              )}
            </div>
          </div>
        )}
      </div>

      <ScheduleModal
        post={scheduleTarget}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onScheduled={handleScheduled}
      />
    </div>
  )
}
