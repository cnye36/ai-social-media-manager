'use client'

import { useState } from 'react'
import { Lightbulb, Loader2, ChevronDown, ChevronUp, ArrowRight, RotateCcw, LayoutList, BookOpen, Microscope } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ContentGoal, ArticleFormat } from '@/types/agents'
import type { BlogIdea } from '@/app/api/blog/ideas/route'

const ANGLE_STYLES: Record<ContentGoal, string> = {
  education: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  engagement: 'bg-violet-500/10 text-violet-300 border-violet-500/30',
  promotion: 'bg-green-500/10 text-green-300 border-green-500/30',
  awareness: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
}

const FORMAT_OPTIONS: { value: ArticleFormat; label: string; icon: React.ReactNode; description: string }[] = [
  {
    value: 'blog_post',
    label: 'Blog Post',
    icon: <BookOpen className="w-3.5 h-3.5" />,
    description: '1,500–2,000 words',
  },
  {
    value: 'listicle',
    label: 'Listicle',
    icon: <LayoutList className="w-3.5 h-3.5" />,
    description: '"X Ways to…"',
  },
  {
    value: 'deep_dive',
    label: 'Deep Dive',
    icon: <Microscope className="w-3.5 h-3.5" />,
    description: '2,000–2,500 words',
  },
]

interface BlogIdeaSparkProps {
  companyId: string
  articleFormat: ArticleFormat
  onFormatChange: (format: ArticleFormat) => void
  onGenerate: (idea: BlogIdea) => void
  disabled?: boolean
}

export function BlogIdeaSpark({ companyId, articleFormat, onFormatChange, onGenerate, disabled }: BlogIdeaSparkProps) {
  const [open, setOpen] = useState(false)
  const [ideas, setIdeas] = useState<BlogIdea[]>([])
  const [lastFormat, setLastFormat] = useState<ArticleFormat | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [generatingIdx, setGeneratingIdx] = useState<number | null>(null)

  async function fetchIdeas(format: ArticleFormat) {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/blog/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, count: 8, articleFormat: format }),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        throw new Error(d.error ?? 'Failed')
      }
      const data = await res.json() as { ideas: BlogIdea[] }
      setIdeas(data.ideas)
      setLastFormat(format)
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
    } else if (ideas.length > 0 && lastFormat === articleFormat) {
      setOpen(true)
    } else {
      fetchIdeas(articleFormat)
    }
  }

  function handleSelect(idea: BlogIdea, idx: number) {
    if (disabled || generatingIdx !== null) return
    setGeneratingIdx(idx)
    setTimeout(() => { setOpen(false); setGeneratingIdx(null) }, 400)
    onGenerate(idea)
  }

  return (
    <div className="space-y-3">
      {/* Format selector */}
      <div className="flex items-center gap-1.5">
        {FORMAT_OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              onFormatChange(opt.value)
              // Reset cached ideas if format changed
              if (opt.value !== lastFormat) {
                setIdeas([])
                setOpen(false)
              }
            }}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border',
              articleFormat === opt.value
                ? 'bg-violet-600/20 border-violet-500/50 text-violet-300'
                : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
            )}
            title={opt.description}
          >
            {opt.icon}
            {opt.label}
          </button>
        ))}
      </div>

      {/* Spark / hide button row */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handleToggle}
          disabled={loading || disabled}
          className={cn(
            'flex items-center gap-1.5 text-xs font-medium transition-colors rounded-lg px-2 py-1 -ml-2',
            open ? 'text-amber-300 bg-amber-500/10' : 'text-zinc-500 hover:text-amber-300 hover:bg-amber-500/10',
            (loading || disabled) && 'opacity-50 cursor-not-allowed'
          )}
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lightbulb className="w-3.5 h-3.5" />}
          {loading ? 'Thinking…' : open ? 'Hide ideas' : `Spark ${FORMAT_OPTIONS.find(f => f.value === articleFormat)?.label ?? ''} ideas`}
          {!loading && (open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
        </button>

        {open && ideas.length > 0 && (
          <button
            type="button"
            onClick={() => fetchIdeas(articleFormat)}
            disabled={loading}
            className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400 transition-colors disabled:opacity-40"
          >
            <RotateCcw className="w-3 h-3" />
            Refresh
          </button>
        )}
      </div>

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
                  disabled={disabled || generatingIdx !== null}
                  className={cn(
                    'group text-left flex items-start gap-3 p-3 rounded-xl border transition-all',
                    isGenerating
                      ? 'border-violet-500/40 bg-violet-500/5'
                      : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700 hover:bg-zinc-800/60',
                    (disabled || generatingIdx !== null) && !isGenerating && 'opacity-50 cursor-not-allowed'
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
                      <span className={cn(
                        'text-[10px] font-medium px-1.5 py-0.5 rounded border capitalize shrink-0',
                        ANGLE_STYLES[idea.angle]
                      )}>
                        {idea.angle}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 leading-relaxed">{idea.outline}</p>
                  </div>
                  <div className="shrink-0 mt-0.5">
                    {isGenerating
                      ? <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
                      : <ArrowRight className="w-4 h-4 text-zinc-700 group-hover:text-zinc-400 transition-colors" />
                    }
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
