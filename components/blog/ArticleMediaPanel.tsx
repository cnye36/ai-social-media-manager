'use client'

import { useState, useEffect } from 'react'
import { ImageIcon, RefreshCw, Loader2, X, Library, Maximize2, ChevronLeft, ChevronRight, ImagePlus } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { HoverDownloadImage } from '@/components/media/HoverDownloadImage'
import { MediaDetailModal } from '@/components/media/MediaDetailModal'
import { AltTextBox } from '@/components/media/AltTextBox'
import { ImagePromptBox } from '@/components/media/ImagePromptBox'
import type { ModalMediaItem } from '@/components/media/MediaDetailModal'
import type { MediaResult } from '@/types/media'
import { BLOG_COVER_IMAGE_SIZE, BLOG_INLINE_IMAGE_SIZE } from '@/lib/blog/image-sizes'

interface LibraryItem {
  id: string
  url: string
  prompt: string | null
  alt_text: string | null
  type: 'image' | 'infographic'
  svg: string | null
  created_at: string
  storage_path?: string
}

interface HistoryEntry {
  result: MediaResult
  note: string
}

export type ArticleMediaMode = 'cover' | 'inline'

interface ArticleMediaPanelProps {
  companyId: string
  articleId: string
  articleTitle: string
  /** Article body or section excerpt used when crafting prompts via the agent. */
  contentContext: string
  mode: ArticleMediaMode
  suggestedPrompt?: string
  brandColors?: { primary?: string; accent?: string }
  onUseCover?: (result: MediaResult) => void
  onInsertInline?: (result: MediaResult) => void
}

type PanelTab = 'generate' | 'library'

export function ArticleMediaPanel({
  companyId,
  articleId,
  articleTitle,
  contentContext,
  mode,
  suggestedPrompt = '',
  brandColors,
  onUseCover,
  onInsertInline,
}: ArticleMediaPanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>('generate')
  const [promptDraft, setPromptDraft] = useState(suggestedPrompt)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [refinementNote, setRefinementNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [includeLogo, setIncludeLogo] = useState(false)
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([])
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [libraryError, setLibraryError] = useState<string | null>(null)
  const [expandedItem, setExpandedItem] = useState<ModalMediaItem | null>(null)

  const current = historyIndex >= 0 ? history[historyIndex] : null
  const canGoBack = historyIndex > 0
  const canGoForward = historyIndex < history.length - 1
  const iterationsLeft = 5 - history.length

  useEffect(() => {
    setPromptDraft(prev => (prev.trim() ? prev : suggestedPrompt))
  }, [suggestedPrompt])

  useEffect(() => {
    if (activeTab === 'library') void loadLibrary()
  }, [activeTab])

  async function loadLibrary() {
    setLibraryLoading(true)
    setLibraryError(null)
    try {
      const res = await fetch(`/api/media?companyId=${companyId}`)
      if (!res.ok) throw new Error('Failed to load library')
      const data = await res.json() as { items: LibraryItem[] }
      setLibraryItems(data.items)
    } catch (e) {
      setLibraryError((e as Error).message)
    } finally {
      setLibraryLoading(false)
    }
  }

  async function generate(note: string, useDraftPrompt: boolean) {
    if (loading) return
    setLoading(true)
    setError(null)

    const trimmedPrompt = promptDraft.trim()
    const refinement = note.trim()

    try {
      const res = await fetch('/api/generate/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          articleId,
          channel: 'blog',
          purpose: mode,
          brandColors,
          postContent: contentContext,
          imagePrompt: useDraftPrompt && trimmedPrompt ? trimmedPrompt : undefined,
          refinementNote: refinement || undefined,
          articleTitle,
          size: mode === 'cover' ? BLOG_COVER_IMAGE_SIZE : BLOG_INLINE_IMAGE_SIZE,
          includeLogo,
        }),
      })

      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Media generation failed')
      }

      const result: MediaResult = await res.json()
      const entry: HistoryEntry = { result, note: refinement || (useDraftPrompt ? 'From prompt' : 'Auto') }

      setHistory(prev => {
        const trimmed = prev.slice(0, historyIndex + 1)
        return [...trimmed, entry]
      })
      setHistoryIndex(prev => prev + 1)
      setPromptDraft(result.promptUsed)
      setRefinementNote('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  function applyResult(result: MediaResult) {
    if (mode === 'cover') onUseCover?.(result)
    else onInsertInline?.(result)
  }

  function acceptFromLibrary(item: LibraryItem) {
    applyResult({
      type: 'image',
      url: item.url,
      storagePath: item.storage_path ?? '',
      promptUsed: item.prompt ?? '',
      altText: item.alt_text ?? item.prompt ?? 'Generated image',
    })
  }

  const modeLabel = mode === 'cover' ? 'Cover image' : 'Section image'

  return (
    <>
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
        <div className="flex border-b border-zinc-800">
          <button
            type="button"
            onClick={() => setActiveTab('generate')}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === 'generate'
                ? 'border-violet-500 text-white'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            )}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            {modeLabel}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('library')}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === 'library'
                ? 'border-violet-500 text-white'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            )}
          >
            <Library className="w-3.5 h-3.5" />
            Library
          </button>
        </div>

        {activeTab === 'generate' ? (
          <>
            <div className="relative bg-zinc-900 min-h-[200px] flex items-center justify-center">
              {history.length > 1 && (
                <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
                  <button
                    type="button"
                    onClick={() => setHistoryIndex(i => i - 1)}
                    disabled={!canGoBack}
                    className="p-1 rounded bg-zinc-900/80 text-zinc-500 hover:text-white disabled:opacity-30"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs text-zinc-500 bg-zinc-900/80 px-1.5 py-0.5 rounded">
                    {historyIndex + 1}/{history.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setHistoryIndex(i => i + 1)}
                    disabled={!canGoForward}
                    className="p-1 rounded bg-zinc-900/80 text-zinc-500 hover:text-white disabled:opacity-30"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              {loading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900/90 z-10 gap-3">
                  <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
                  <p className="text-sm text-zinc-400">Generating image…</p>
                </div>
              )}

              {!current && !loading && (
                <div className="flex flex-col items-center gap-2 py-10 text-zinc-600 px-4 text-center">
                  <ImageIcon className="w-9 h-9" />
                  <p className="text-sm">Generate a {mode === 'cover' ? 'cover' : 'section'} image for this article</p>
                </div>
              )}

              {current && (
                <HoverDownloadImage
                  src={current.result.url}
                  alt={current.result.altText}
                  className="w-full object-contain max-h-[320px]"
                  wrapperClassName="w-full"
                  downloadFilename={`${articleTitle.slice(0, 40)}-${mode}.png`}
                />
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 px-4 py-2 bg-red-950/50 border-t border-red-900/50">
                <X className="w-3.5 h-3.5 text-red-400 shrink-0" />
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}

            <div className="p-4 space-y-3 border-t border-zinc-800">
              {current?.result.altText && (
                <AltTextBox value={current.result.altText} />
              )}

              {current?.result.promptUsed && (
                <ImagePromptBox
                  label="Prompt used for this image"
                  value={current.result.promptUsed}
                  readOnly
                />
              )}

              <ImagePromptBox
                label={suggestedPrompt && !promptDraft.trim() ? 'Suggested image prompt' : 'Image prompt'}
                value={promptDraft}
                onChange={setPromptDraft}
                hint="Edit before generating, or leave blank to let AI craft a prompt from your article content."
                placeholder={
                  mode === 'cover'
                    ? 'e.g. Editorial hero photo illustrating the article topic, soft lighting, no text overlay…'
                    : 'e.g. Diagram showing the three-step process described in this section…'
                }
              />

              {history.length > 0 && iterationsLeft > 0 && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={refinementNote}
                    onChange={e => setRefinementNote(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && generate(refinementNote, false)}
                    placeholder={`Refine (${iterationsLeft} left) — or edit prompt above`}
                    className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500"
                  />
                  <button
                    type="button"
                    onClick={() => generate(refinementNote, false)}
                    disabled={loading || !refinementNote.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Refine
                  </button>
                </div>
              )}

              <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeLogo}
                  onChange={e => setIncludeLogo(e.target.checked)}
                  className="rounded border-zinc-700 bg-zinc-900 text-violet-600 focus:ring-violet-500 focus:ring-offset-0"
                />
                Include brand logo (uploaded in Settings)
              </label>

              <div className="flex gap-2">
                {!current ? (
                  <>
                    <button
                      type="button"
                      onClick={() => generate('', Boolean(promptDraft.trim()))}
                      disabled={loading}
                      className="flex-1 flex items-center justify-center gap-2 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                      {promptDraft.trim() ? 'Generate from prompt' : 'Generate'}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => applyResult(current.result)}
                    className="flex-1 flex items-center justify-center gap-2 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <ImagePlus className="w-4 h-4" />
                    {mode === 'cover' ? 'Use as cover' : 'Insert in article'}
                  </button>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="p-4">
            {libraryLoading ? (
              <div className="flex items-center justify-center py-12 gap-2 text-zinc-600">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Loading library…</span>
              </div>
            ) : libraryError ? (
              <p className="text-sm text-red-400 text-center py-8">{libraryError}</p>
            ) : libraryItems.length === 0 ? (
              <p className="text-sm text-zinc-600 text-center py-8">No images yet. Generate one to add it here.</p>
            ) : (
              <div className="space-y-3 max-h-[480px] overflow-y-auto">
                {libraryItems.map(item => (
                  <div
                    key={item.id}
                    className="flex gap-3 p-2 rounded-lg border border-zinc-800 bg-zinc-900/50 hover:border-violet-500/40 transition-colors"
                  >
                    <div className="w-20 h-20 shrink-0 rounded overflow-hidden bg-zinc-800">
                      <HoverDownloadImage
                        src={item.url}
                        alt={item.alt_text ?? item.prompt ?? ''}
                        className="w-full h-full object-cover"
                        wrapperClassName="w-full h-full"
                        downloadFilename={`media-${item.id}.png`}
                      />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      {item.prompt && (
                        <p className="text-[10px] text-zinc-400 leading-snug line-clamp-3" title={item.prompt}>
                          <span className="text-zinc-600 uppercase tracking-wide font-medium">Prompt: </span>
                          {item.prompt}
                        </p>
                      )}
                      <p className="text-[9px] text-zinc-600">{format(new Date(item.created_at), 'MMM d, yyyy')}</p>
                      <div className="flex gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => acceptFromLibrary(item)}
                          className="px-2 py-0.5 bg-violet-600 hover:bg-violet-500 text-white rounded text-[10px] font-medium"
                        >
                          {mode === 'cover' ? 'Use as cover' : 'Insert'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setExpandedItem({
                            id: item.id,
                            url: item.url,
                            prompt: item.prompt,
                            type: 'image',
                            svg: null,
                            storage_path: item.storage_path,
                            post_id: null,
                            created_at: item.created_at,
                            posts: null,
                          })}
                          className="px-2 py-0.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded text-[10px] flex items-center gap-1"
                        >
                          <Maximize2 className="w-3 h-3" />
                          View
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {expandedItem && (
        <MediaDetailModal
          item={expandedItem}
          companyId={companyId}
          onClose={() => setExpandedItem(null)}
        />
      )}
    </>
  )
}
