'use client'

import { useState } from 'react'
import { ImageIcon, LayoutTemplate, RefreshCw, ExternalLink, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MediaResult {
  type: 'image' | 'infographic'
  url: string
  storagePath: string
  svg?: string
}

interface HistoryEntry {
  result: MediaResult
  note: string
}

interface MediaPanelProps {
  postContent: string
  companyId: string
  channel: string
  brandColors?: { primary?: string; accent?: string }
  onAccept?: (result: MediaResult) => void
}

export function MediaPanel({ postContent, companyId, channel, brandColors, onAccept }: MediaPanelProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [refinementNote, setRefinementNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [canvaLoading, setCanvaLoading] = useState(false)
  const [canvaUrl, setCanvaUrl] = useState<string | null>(null)

  const current = historyIndex >= 0 ? history[historyIndex] : null
  const canGoBack = historyIndex > 0
  const canGoForward = historyIndex < history.length - 1
  const iterationsLeft = 5 - history.length

  async function generate(note: string) {
    if (loading) return
    setLoading(true)
    setError(null)
    setCanvaUrl(null)

    try {
      const res = await fetch('/api/generate/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postContent, companyId, channel, refinementNote: note || undefined, brandColors }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Media generation failed')
      }

      const result: MediaResult = await res.json()
      const entry: HistoryEntry = { result, note }

      setHistory(prev => {
        // Drop any forward history when a new generation is added
        const trimmed = prev.slice(0, historyIndex + 1)
        return [...trimmed, entry]
      })
      setHistoryIndex(prev => prev + 1)
      setRefinementNote('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function sendToCanva() {
    if (!current || canvaLoading) return
    setCanvaLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/canva/design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: current.result.url,
          storagePath: current.result.storagePath,
          title: `Social post – ${channel}`,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Canva design creation failed')
      }

      const { editUrl } = await res.json()
      setCanvaUrl(editUrl)
      window.open(editUrl, '_blank')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setCanvaLoading(false)
    }
  }

  function acceptMedia() {
    if (current && onAccept) onAccept(current.result)
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-medium text-white">Media</span>
          {current && (
            <span className={cn(
              'text-[10px] px-1.5 py-0.5 rounded font-medium',
              current.result.type === 'image' ? 'bg-blue-500/15 text-blue-300' : 'bg-emerald-500/15 text-emerald-300'
            )}>
              {current.result.type === 'image' ? 'AI Image' : 'Infographic'}
            </span>
          )}
        </div>

        {/* Iteration nav */}
        {history.length > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setHistoryIndex(i => i - 1)}
              disabled={!canGoBack}
              className="p-1 rounded text-zinc-500 hover:text-white disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-zinc-500">{historyIndex + 1}/{history.length}</span>
            <button
              onClick={() => setHistoryIndex(i => i + 1)}
              disabled={!canGoForward}
              className="p-1 rounded text-zinc-500 hover:text-white disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Media display */}
      <div className="relative bg-zinc-900 min-h-[240px] flex items-center justify-center">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900/90 z-10 gap-3">
            <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
            <p className="text-sm text-zinc-400">Generating media…</p>
          </div>
        )}

        {!current && !loading && (
          <div className="flex flex-col items-center gap-3 py-12 text-zinc-600">
            <ImageIcon className="w-10 h-10" />
            <p className="text-sm">Generate media for this post</p>
          </div>
        )}

        {current && (
          current.result.type === 'infographic' && current.result.svg ? (
            <div
              className="w-full"
              dangerouslySetInnerHTML={{ __html: current.result.svg }}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={current.result.url}
              alt="Generated media"
              className="w-full object-contain max-h-[480px]"
            />
          )
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-950/50 border-t border-red-900/50">
          <X className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="p-4 space-y-3 border-t border-zinc-800">
        {/* Refinement input */}
        {history.length > 0 && iterationsLeft > 0 && (
          <div className="flex gap-2">
            <input
              type="text"
              value={refinementNote}
              onChange={e => setRefinementNote(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && generate(refinementNote)}
              placeholder={`Refine… (${iterationsLeft} left)`}
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500"
            />
            <button
              onClick={() => generate(refinementNote)}
              disabled={loading || !refinementNote.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refine
            </button>
          </div>
        )}

        {iterationsLeft === 0 && (
          <p className="text-xs text-zinc-600 text-center">Max iterations reached. Accept or start over.</p>
        )}

        {/* Primary actions */}
        <div className="flex gap-2">
          {!current ? (
            <button
              onClick={() => generate('')}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
              Generate
            </button>
          ) : (
            <>
              <button
                onClick={acceptMedia}
                className="flex-1 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Use this media
              </button>
              <button
                onClick={sendToCanva}
                disabled={canvaLoading}
                className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                title="Edit in Canva"
              >
                {canvaLoading
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <LayoutTemplate className="w-4 h-4" />
                }
                Canva
                {canvaUrl && <ExternalLink className="w-3 h-3" />}
              </button>
            </>
          )}
        </div>

        {/* Canva template link */}
        <a
          href="https://www.canva.com/templates/?query=social+media"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 w-full py-1.5 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          <LayoutTemplate className="w-3.5 h-3.5" />
          Browse Canva templates
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  )
}
