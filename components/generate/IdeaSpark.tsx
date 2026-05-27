'use client'

import { useState } from 'react'
import { Lightbulb, Loader2, ChevronDown, ChevronUp, ArrowRight, RotateCcw, GitBranch } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import type { ContentGoal } from '@/types/agents'
import type { Channel } from '@/types/database'
import { ideaWantsThread } from '@/lib/generate/x-thread'
import type { PostIdea } from '@/app/api/generate/ideas/route'

const ANGLE_STYLES: Record<ContentGoal, string> = {
  education: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  engagement: 'bg-violet-500/10 text-violet-300 border-violet-500/30',
  promotion: 'bg-green-500/10 text-green-300 border-green-500/30',
  awareness: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
}

interface IdeaSparkProps {
  companyId: string
  selectedChannels: Channel[]
  onGenerate: (idea: PostIdea) => void
  disabled?: boolean
}

export function IdeaSpark({ companyId, selectedChannels, onGenerate, disabled }: IdeaSparkProps) {
  const [open, setOpen] = useState(false)
  const [ideas, setIdeas] = useState<PostIdea[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [generatingIdx, setGeneratingIdx] = useState<number | null>(null)

  async function fetchIdeas() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/generate/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, count: 8 }),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        throw new Error(d.error ?? 'Failed to generate ideas')
      }
      const data = await res.json() as { ideas: PostIdea[] }
      setIdeas(data.ideas)
      setOpen(true)
    } catch (e) {
      setError((e as Error).message)
      setOpen(true)
    } finally {
      setLoading(false)
    }
  }

  function handleToggle() {
    if (disabled) return
    if (open) {
      setOpen(false)
    } else if (ideas.length > 0) {
      setOpen(true)
    } else {
      fetchIdeas()
    }
  }

  function handleSelect(idea: PostIdea, idx: number) {
    if (disabled || generatingIdx !== null || selectedChannels.length === 0) return
    setGeneratingIdx(idx)
    // Close after a brief moment so the user sees the feedback
    setTimeout(() => {
      setOpen(false)
      setGeneratingIdx(null)
    }, 400)
    onGenerate(idea)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handleToggle}
          disabled={loading || disabled}
          className={cn(
            'flex items-center gap-1.5 text-xs font-medium transition-colors rounded-lg px-2 py-1 -ml-2',
            open
              ? 'text-amber-300 bg-amber-500/10'
              : 'text-zinc-500 hover:text-amber-300 hover:bg-amber-500/10',
            (loading || disabled) && 'opacity-50 cursor-not-allowed'
          )}
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Lightbulb className="w-3.5 h-3.5" />
          )}
          {loading ? 'Thinking…' : open ? 'Hide ideas' : 'Spark ideas'}
          {!loading && (open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
        </button>

        {open && ideas.length > 0 && (
          <button
            type="button"
            onClick={fetchIdeas}
            disabled={loading || disabled}
            className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400 transition-colors disabled:opacity-40"
          >
            <RotateCcw className="w-3 h-3" />
            Refresh
          </button>
        )}
      </div>

      {open && selectedChannels.length === 0 && (
        <p className="text-xs text-amber-400/90 py-1">
          Select at least one channel above — ideas generate only for your toggled channels.
        </p>
      )}

      {open && (
        <div className="grid grid-cols-1 gap-2 pt-1 pb-2">
          {error ? (
            <p className="text-xs text-red-400 py-2">{error}</p>
          ) : (
            ideas.map((idea, i) => {
              const isGenerating = generatingIdx === i
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSelect(idea, i)}
                  disabled={disabled || generatingIdx !== null || selectedChannels.length === 0}
                  className={cn(
                    'group text-left flex items-start gap-3 p-3 rounded-xl border transition-all',
                    isGenerating
                      ? 'border-violet-500/40 bg-violet-500/5'
                      : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700 hover:bg-zinc-800/60',
                    (disabled || generatingIdx !== null || selectedChannels.length === 0) && !isGenerating && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-start gap-2 flex-wrap">
                      <span className={cn(
                        'text-sm font-medium leading-snug transition-colors',
                        isGenerating ? 'text-violet-300' : 'text-zinc-200 group-hover:text-white'
                      )}>
                        {idea.title}
                      </span>
                      <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded border capitalize shrink-0', ANGLE_STYLES[idea.angle])}>
                        {idea.angle}
                      </span>
                      {ideaWantsThread(idea) && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0 flex items-center gap-0.5 border-sky-500/30 bg-sky-500/10 text-sky-300">
                          <GitBranch className="w-2.5 h-2.5" />
                          {selectedChannels.includes('x') ? 'X thread' : 'Thread (needs X)'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 leading-relaxed">{idea.description}</p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {selectedChannels.map(ch => (
                        <Badge key={ch} variant={ch} className="text-[10px]">{ch}</Badge>
                      ))}
                      {selectedChannels.length === 0 && idea.suggestedChannels.map(ch => (
                        <Badge key={ch} variant={ch as Channel} className="text-[10px] opacity-60">{ch} (suggested)</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="shrink-0 mt-0.5">
                    {isGenerating ? (
                      <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
                    ) : (
                      <ArrowRight className="w-4 h-4 text-zinc-700 group-hover:text-zinc-400 transition-colors" />
                    )}
                  </div>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
