'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, isSameMonth, isToday,
  addMonths, subMonths, isSameDay,
} from 'date-fns'
import { ChevronLeft, ChevronRight, Plus, X, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PostEditorModal } from '@/components/posts/PostEditorModal'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { LinkedInIcon, XIcon, RedditIcon, FacebookIcon } from '@/components/ui/channel-icons'
import { calendarDisplayAt } from '@/lib/content-status'
import type { Post, Channel, Article } from '@/types/database'

const CHANNEL_CHIP: Record<Channel, { bg: string; text: string; icon: React.ReactNode }> = {
  linkedin: { bg: 'bg-blue-500/15', text: 'text-blue-300', icon: <LinkedInIcon className="w-2.5 h-2.5" /> },
  x:        { bg: 'bg-zinc-500/15', text: 'text-zinc-300', icon: <XIcon className="w-2.5 h-2.5" /> },
  reddit:   { bg: 'bg-orange-500/15', text: 'text-orange-300', icon: <RedditIcon className="w-2.5 h-2.5" /> },
  facebook: { bg: 'bg-blue-400/15', text: 'text-blue-200', icon: <FacebookIcon className="w-2.5 h-2.5" /> },
}

const ARTICLE_CHIP = { bg: 'bg-emerald-500/15', text: 'text-emerald-300' }

type CalendarItem =
  | { type: 'post'; data: Post; time: Date }
  | { type: 'article'; data: Article; time: Date }

interface ContentCalendarProps {
  posts: Post[]
  articles?: Article[]
  companyId: string
  generateHref: string
  brandColors?: { primary?: string; accent?: string }
}

export function ContentCalendar({ posts: initialPosts, articles: initialArticles = [], companyId, generateHref, brandColors }: ContentCalendarProps) {
  const router = useRouter()
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [allPosts, setAllPosts] = useState<Post[]>(initialPosts)
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [overflowItems, setOverflowItems] = useState<CalendarItem[]>([])
  const [overflowDay, setOverflowDay] = useState<Date | null>(null)

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  function itemsForDay(day: Date): CalendarItem[] {
    const posts: CalendarItem[] = allPosts.flatMap(p => {
      const at = calendarDisplayAt(p)
      if (!at || !isSameDay(at, day)) return []
      return [{ type: 'post' as const, data: p, time: at }]
    })

    const articles: CalendarItem[] = initialArticles.flatMap(a => {
      const at = calendarDisplayAt(a)
      if (!at || !isSameDay(at, day)) return []
      return [{ type: 'article' as const, data: a, time: at }]
    })

    return [...posts, ...articles].sort((a, b) => a.time.getTime() - b.time.getTime())
  }

  function handleUpdate(updated: Post) {
    setAllPosts(prev => prev.map(p => p.id === updated.id ? updated : p))
    setSelectedPost(updated)
    setOverflowItems(prev => prev.map(item =>
      item.type === 'post' && item.data.id === updated.id
        ? { ...item, data: updated }
        : item
    ))
  }

  function handleDelete(id: string) {
    setAllPosts(prev => prev.filter(p => p.id !== id))
    setSelectedPost(null)
    setOverflowItems(prev => prev.filter(item => !(item.type === 'post' && item.data.id === id)))
  }

  function openPost(post: Post) {
    setSelectedPost(post)
    setModalOpen(true)
  }

  function openOverflow(day: Date, items: CalendarItem[]) {
    setOverflowDay(day)
    setOverflowItems(items)
  }

  const scheduledCount = allPosts.filter(p => p.status === 'scheduled' && p.scheduled_for).length
    + initialArticles.filter(a => a.status === 'scheduled' && a.scheduled_for).length

  return (
    <div className="space-y-4">
      {/* Header */}
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
            <span className="text-white font-medium">{scheduledCount}</span> scheduled
          </p>
          <a
            href={`/${companyId}/blog`}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700/80 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            New article
          </a>
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
          <div key={d} className="text-center text-xs text-zinc-600 font-medium py-2">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 border-l border-t border-zinc-800 rounded-xl overflow-hidden">
        {days.map(day => {
          const dayItems = itemsForDay(day)
          const isCurrentMonth = isSameMonth(day, currentMonth)
          const isCurrentDay = isToday(day)
          const hidden = dayItems.length - 3

          return (
            <div
              key={day.toISOString()}
              className={cn(
                'min-h-[100px] border-r border-b border-zinc-800 p-2',
                !isCurrentMonth && 'bg-zinc-950/50',
                isCurrentDay && 'bg-violet-950/20'
              )}
            >
              <div className="flex justify-end mb-1.5">
                <span className={cn(
                  'text-xs w-6 h-6 flex items-center justify-center rounded-full font-medium',
                  isCurrentDay ? 'bg-violet-600 text-white' : isCurrentMonth ? 'text-zinc-400' : 'text-zinc-700'
                )}>
                  {format(day, 'd')}
                </span>
              </div>

              <div className="space-y-1">
                {dayItems.slice(0, 3).map((item, i) => {
                  const timeStr = format(item.time, 'h:mma')
                  if (item.type === 'post') {
                    const chip = CHANNEL_CHIP[item.data.channel as Channel]
                    return (
                      <button
                        key={item.data.id}
                        onClick={() => openPost(item.data)}
                        className={cn(
                          'w-full flex items-center gap-1 px-1.5 py-0.5 rounded text-left transition-opacity hover:opacity-80',
                          chip.bg, chip.text
                        )}
                      >
                        {chip.icon}
                        <span className="text-[10px] truncate leading-tight">
                          <span className="font-medium mr-0.5">{timeStr}</span>
                          {item.data.content.slice(0, 20)}
                        </span>
                      </button>
                    )
                  }
                  // article
                  return (
                    <button
                      key={item.data.id + '-article-' + i}
                      onClick={() => router.push(`/${companyId}/blog/${item.data.id}`)}
                      className={cn(
                        'w-full flex items-center gap-1 px-1.5 py-0.5 rounded text-left transition-opacity hover:opacity-80',
                        ARTICLE_CHIP.bg, ARTICLE_CHIP.text
                      )}
                    >
                      <FileText className="w-2.5 h-2.5 shrink-0" />
                      <span className="text-[10px] truncate leading-tight">
                        <span className="font-medium mr-0.5">{timeStr}</span>
                        {item.data.title || 'Untitled'}
                      </span>
                    </button>
                  )
                })}
                {hidden > 0 && (
                  <button
                    onClick={() => openOverflow(day, dayItems)}
                    className="text-[10px] text-violet-400 hover:text-violet-300 px-1 transition-colors"
                  >
                    +{hidden} more
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 pt-2 flex-wrap">
        {(Object.entries(CHANNEL_CHIP) as [Channel, typeof CHANNEL_CHIP[Channel]][]).map(([ch, { bg, text, icon }]) => (
          <div key={ch} className="flex items-center gap-1.5">
            <span className={cn('w-3 h-3 rounded-sm flex items-center justify-center', bg, text)}>{icon}</span>
            <span className="text-xs text-zinc-500 capitalize">{ch}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className={cn('w-3 h-3 rounded-sm flex items-center justify-center', ARTICLE_CHIP.bg, ARTICLE_CHIP.text)}>
            <FileText className="w-2 h-2" />
          </span>
          <span className="text-xs text-zinc-500">Blog article</span>
        </div>
      </div>

      {/* Day overflow dialog */}
      <Dialog open={!!overflowDay} onOpenChange={open => { if (!open) setOverflowDay(null) }}>
        <DialogContent className="max-w-sm p-0 overflow-hidden">
          <DialogTitle className="sr-only">
            {overflowDay ? format(overflowDay, 'EEEE, MMMM d') : 'Posts'}
          </DialogTitle>
          <DialogDescription className="sr-only">All content scheduled for this day</DialogDescription>
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <p className="text-sm font-semibold text-white">
              {overflowDay ? format(overflowDay, 'EEEE, MMMM d') : ''}
            </p>
            <button onClick={() => setOverflowDay(null)} className="text-zinc-500 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="divide-y divide-zinc-800 max-h-80 overflow-y-auto">
            {overflowItems.map((item, i) => {
              const time = format(item.time, 'h:mm a')
              if (item.type === 'post') {
                const chip = CHANNEL_CHIP[item.data.channel as Channel]
                return (
                  <button
                    key={item.data.id + '-overflow-' + i}
                    onClick={() => { setOverflowDay(null); openPost(item.data) }}
                    className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-zinc-800/50 transition-colors"
                  >
                    <span className={cn('flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0', chip.bg, chip.text)}>
                      {chip.icon} {item.data.channel}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-zinc-500 mb-0.5">{time}</p>
                      <p className="text-xs text-zinc-300 line-clamp-2">{item.data.content}</p>
                    </div>
                  </button>
                )
              }
              return (
                <button
                  key={item.data.id + '-overflow-article-' + i}
                  onClick={() => { setOverflowDay(null); router.push(`/${companyId}/blog/${item.data.id}`) }}
                  className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-zinc-800/50 transition-colors"
                >
                  <span className={cn('flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0', ARTICLE_CHIP.bg, ARTICLE_CHIP.text)}>
                    <FileText className="w-2.5 h-2.5" /> article
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-zinc-500 mb-0.5">{time}</p>
                    <p className="text-xs text-zinc-300 line-clamp-1 font-medium">{item.data.title || 'Untitled'}</p>
                    {item.data.excerpt && <p className="text-xs text-zinc-500 line-clamp-1">{item.data.excerpt}</p>}
                  </div>
                </button>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>

      <PostEditorModal
        post={selectedPost}
        open={modalOpen}
        onOpenChange={open => { setModalOpen(open); if (!open) setSelectedPost(null) }}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        companyId={companyId}
        brandColors={brandColors}
      />
    </div>
  )
}
