'use client'

import { List, LayoutGrid, CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'

export type PostView = 'list' | 'grid' | 'calendar'

interface PostViewToggleProps {
  view: PostView
  onChange: (v: PostView) => void
}

const VIEWS: { id: PostView; icon: React.ReactNode; label: string }[] = [
  { id: 'list',     icon: <List className="w-3.5 h-3.5" />,         label: 'List' },
  { id: 'grid',     icon: <LayoutGrid className="w-3.5 h-3.5" />,   label: 'Grid' },
  { id: 'calendar', icon: <CalendarDays className="w-3.5 h-3.5" />, label: 'Calendar' },
]

export function PostViewToggle({ view, onChange }: PostViewToggleProps) {
  return (
    <div className="flex items-center bg-zinc-800/60 border border-zinc-700/50 rounded-lg p-0.5 gap-0.5">
      {VIEWS.map(v => (
        <button
          key={v.id}
          type="button"
          onClick={() => onChange(v.id)}
          title={v.label}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all',
            view === v.id
              ? 'bg-zinc-700 text-white shadow-sm'
              : 'text-zinc-500 hover:text-zinc-300'
          )}
        >
          {v.icon}
          <span className="hidden sm:inline">{v.label}</span>
        </button>
      ))}
    </div>
  )
}
