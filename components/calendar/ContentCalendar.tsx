'use client'

import { useState } from 'react'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, isSameMonth, isToday,
  addMonths, subMonths, isSameDay,
} from 'date-fns'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PostDrawer } from './PostDrawer'
import { LinkedInIcon, XIcon, RedditIcon, FacebookIcon } from '@/components/ui/channel-icons'
import type { Post, Channel } from '@/types/database'

const CHANNEL_CHIP: Record<Channel, { bg: string; text: string; icon: React.ReactNode }> = {
  linkedin: { bg: 'bg-blue-500/15', text: 'text-blue-300', icon: <LinkedInIcon className="w-2.5 h-2.5" /> },
  x:        { bg: 'bg-zinc-500/15', text: 'text-zinc-300', icon: <XIcon className="w-2.5 h-2.5" /> },
  reddit:   { bg: 'bg-orange-500/15', text: 'text-orange-300', icon: <RedditIcon className="w-2.5 h-2.5" /> },
  facebook: { bg: 'bg-blue-400/15', text: 'text-blue-200', icon: <FacebookIcon className="w-2.5 h-2.5" /> },
}

interface ContentCalendarProps {
  posts: Post[]
  companyId: string
  generateHref: string
}

export function ContentCalendar({ posts: initialPosts, companyId, generateHref }: ContentCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [allPosts, setAllPosts] = useState<Post[]>(initialPosts)
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  function postsForDay(day: Date): Post[] {
    return allPosts.filter(p => p.scheduled_for && isSameDay(new Date(p.scheduled_for), day))
  }

  function handleUpdate(updated: Post) {
    setAllPosts(prev => prev.map(p => p.id === updated.id ? updated : p))
    setSelectedPost(updated)
  }

  function handleDelete(id: string) {
    setAllPosts(prev => prev.filter(p => p.id !== id))
    setSelectedPost(null)
  }

  const scheduledCount = allPosts.filter(p => p.status === 'scheduled' && p.scheduled_for).length

  return (
    <div className="space-y-4">
      {/* Calendar header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCurrentMonth(m => subMonths(m, 1))}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-semibold text-white w-40 text-center">
            {format(currentMonth, 'MMMM yyyy')}
          </h2>
          <button
            onClick={() => setCurrentMonth(m => addMonths(m, 1))}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <p className="text-sm text-zinc-500">
            <span className="text-white font-medium">{scheduledCount}</span> scheduled this month
          </p>
          <a
            href={generateHref}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-500 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Generate post
          </a>
        </div>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="text-center text-xs text-zinc-600 font-medium py-2">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 border-l border-t border-zinc-800 rounded-xl overflow-hidden">
        {days.map(day => {
          const dayPosts = postsForDay(day)
          const isCurrentMonth = isSameMonth(day, currentMonth)
          const isCurrentDay = isToday(day)

          return (
            <div
              key={day.toISOString()}
              className={cn(
                'min-h-[100px] border-r border-b border-zinc-800 p-2',
                !isCurrentMonth && 'bg-zinc-950/50',
                isCurrentDay && 'bg-violet-950/20'
              )}
            >
              {/* Day number */}
              <div className="flex justify-end mb-1.5">
                <span className={cn(
                  'text-xs w-6 h-6 flex items-center justify-center rounded-full font-medium',
                  isCurrentDay
                    ? 'bg-violet-600 text-white'
                    : isCurrentMonth ? 'text-zinc-400' : 'text-zinc-700'
                )}>
                  {format(day, 'd')}
                </span>
              </div>

              {/* Post chips */}
              <div className="space-y-1">
                {dayPosts.slice(0, 3).map(post => {
                  const chip = CHANNEL_CHIP[post.channel as Channel]
                  return (
                    <button
                      key={post.id}
                      onClick={() => setSelectedPost(post)}
                      className={cn(
                        'w-full flex items-center gap-1 px-1.5 py-0.5 rounded text-left transition-opacity hover:opacity-80',
                        chip.bg, chip.text
                      )}
                    >
                      {chip.icon}
                      <span className="text-[10px] truncate leading-tight">
                        {post.content.slice(0, 30)}
                      </span>
                    </button>
                  )
                })}
                {dayPosts.length > 3 && (
                  <p className="text-[10px] text-zinc-600 px-1">+{dayPosts.length - 3} more</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 pt-2">
        {(Object.entries(CHANNEL_CHIP) as [Channel, typeof CHANNEL_CHIP[Channel]][]).map(([ch, { bg, text, icon }]) => (
          <div key={ch} className="flex items-center gap-1.5">
            <span className={cn('w-3 h-3 rounded-sm flex items-center justify-center', bg, text)}>{icon}</span>
            <span className="text-xs text-zinc-500 capitalize">{ch}</span>
          </div>
        ))}
      </div>

      {/* Post drawer */}
      {selectedPost && (
        <PostDrawer
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}
