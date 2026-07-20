'use client'

import { useState, useEffect, useRef } from 'react'
import { ImageIcon, LayoutTemplate, RefreshCw, ExternalLink, ChevronLeft, ChevronRight, Loader2, X, Library, Maximize2, Film } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { HoverDownloadImage } from '@/components/media/HoverDownloadImage'
import { HoverDownloadVideo } from '@/components/media/HoverDownloadVideo'
import { MediaDetailModal } from '@/components/media/MediaDetailModal'
import { AltTextBox } from '@/components/media/AltTextBox'
import { ImagePromptBox } from '@/components/media/ImagePromptBox'
import type { ModalMediaItem } from '@/components/media/MediaDetailModal'
import type { GeneratedMediaResult, MediaResult, VideoResult } from '@/types/media'
import type { VideoJob } from '@/types/database'

interface LibraryItem {
  id: string
  url: string
  prompt: string | null
  alt_text: string | null
  type: 'image' | 'infographic' | 'video'
  svg: string | null
  created_at: string
  storagePath?: string  // mapped from storage_path for onAccept compat
  storage_path?: string
}

interface HistoryEntry {
  result: MediaResult
  note: string
}

interface MediaPanelProps {
  postContent: string
  companyId: string
  channel: string
  postId?: string
  brandColors?: { primary?: string; accent?: string }
  /** Suggested prompt from post generation (IMAGE_PROMPT suffix, etc.) */
  suggestedPrompt?: string
  onAccept?: (result: GeneratedMediaResult) => void
}

type PanelTab = 'generate' | 'library'
type MediaMode = 'image' | 'video'

const VIDEO_SIZE_BY_CHANNEL: Record<string, '1280x720' | '720x1280'> = {
  linkedin: '1280x720',
  facebook: '1280x720',
  x: '1280x720',
}

type VideoJobPhase =
  | { phase: 'idle' }
  | { phase: 'starting' }
  | { phase: 'running'; jobId: string; progress: number }
  | { phase: 'done'; result: VideoResult }
  | { phase: 'error'; message: string }

export function MediaPanel({ postContent, companyId, channel, postId, brandColors, suggestedPrompt, onAccept }: MediaPanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>('generate')
  const [mediaMode, setMediaMode] = useState<MediaMode>('image')

  // ── Generate tab state (image) ───────────────────────────────────────────────
  const [promptDraft, setPromptDraft] = useState(suggestedPrompt ?? '')
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [refinementNote, setRefinementNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [canvaLoading, setCanvaLoading] = useState(false)
  const [canvaUrl, setCanvaUrl] = useState<string | null>(null)
  const [includeLogo, setIncludeLogo] = useState(false)

  // ── Generate tab state (video) ───────────────────────────────────────────────
  const [videoPromptDraft, setVideoPromptDraft] = useState('')
  const [videoPromptLoading, setVideoPromptLoading] = useState(false)
  const [videoJob, setVideoJob] = useState<VideoJobPhase>({ phase: 'idle' })
  const videoPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (videoPollRef.current !== null) clearInterval(videoPollRef.current)
    }
  }, [])

  useEffect(() => {
    if (mediaMode === 'video' && !videoPromptDraft && videoJob.phase === 'idle') {
      suggestVideoPrompt()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaMode])

  async function suggestVideoPrompt() {
    setVideoPromptLoading(true)
    try {
      const res = await fetch('/api/generate/video-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postContent, channel, brandColors }),
      })
      if (!res.ok) return
      const data = await res.json() as { videoPrompt: string }
      setVideoPromptDraft(data.videoPrompt)
    } finally {
      setVideoPromptLoading(false)
    }
  }

  async function generateVideo() {
    if (!videoPromptDraft.trim() || videoJob.phase === 'starting' || videoJob.phase === 'running') return
    setVideoJob({ phase: 'starting' })

    try {
      const res = await fetch('/api/generate/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: videoPromptDraft.trim(),
          companyId,
          postId,
          size: VIDEO_SIZE_BY_CHANNEL[channel] ?? '1280x720',
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setVideoJob({ phase: 'error', message: data.error ?? 'Video generation failed to start' })
        return
      }
      setVideoJob({ phase: 'running', jobId: data.jobId, progress: 0 })
      pollVideoJob(data.jobId)
    } catch (err) {
      setVideoJob({ phase: 'error', message: (err as Error).message })
    }
  }

  function pollVideoJob(jobId: string) {
    videoPollRef.current = setInterval(async () => {
      const res = await fetch(`/api/generate/video/${jobId}`)
      if (!res.ok) return
      const job = await res.json() as VideoJob

      if (job.status === 'completed' && job.url && job.storage_path) {
        clearInterval(videoPollRef.current!)
        videoPollRef.current = null
        setVideoJob({
          phase: 'done',
          result: { type: 'video', url: job.url, storagePath: job.storage_path, promptUsed: job.prompt },
        })
      } else if (job.status === 'failed') {
        clearInterval(videoPollRef.current!)
        videoPollRef.current = null
        setVideoJob({ phase: 'error', message: job.error_message ?? 'Video generation failed' })
      } else {
        setVideoJob({ phase: 'running', jobId, progress: job.progress ?? 0 })
      }
    }, 3000)
  }

  function acceptVideo() {
    if (videoJob.phase === 'done' && onAccept) onAccept(videoJob.result)
  }

  function resetVideoJob() {
    if (videoPollRef.current !== null) clearInterval(videoPollRef.current)
    videoPollRef.current = null
    setVideoJob({ phase: 'idle' })
  }

  // ── Library tab state ────────────────────────────────────────────────────────
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([])
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [libraryError, setLibraryError] = useState<string | null>(null)
  const [expandedItem, setExpandedItem] = useState<ModalMediaItem | null>(null)

  const current = historyIndex >= 0 ? history[historyIndex] : null
  const canGoBack = historyIndex > 0
  const canGoForward = historyIndex < history.length - 1
  const iterationsLeft = 5 - history.length

  useEffect(() => {
    if (activeTab === 'library') loadLibrary()
  }, [activeTab])

  useEffect(() => {
    setPromptDraft(prev => (prev.trim() ? prev : (suggestedPrompt ?? '')))
  }, [suggestedPrompt])

  async function loadLibrary() {
    setLibraryLoading(true)
    setLibraryError(null)
    try {
      const res = await fetch(`/api/media?companyId=${companyId}`)
      if (!res.ok) throw new Error('Failed to load library')
      const data = await res.json() as { items: LibraryItem[] }
      // Video assets aren't editable via this image-focused grid (Canva, alt-text) — surface them separately later.
      setLibraryItems(data.items.filter(item => item.type !== 'video'))
    } catch (e) {
      setLibraryError((e as Error).message)
    } finally {
      setLibraryLoading(false)
    }
  }

  async function generate(note: string, useDraftPrompt = false) {
    if (loading) return
    setLoading(true)
    setError(null)
    setCanvaUrl(null)

    try {
      const res = await fetch('/api/generate/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postContent, companyId, channel,
          refinementNote: note || undefined,
          brandColors,
          postId,
          imagePrompt: useDraftPrompt && promptDraft.trim() ? promptDraft.trim() : undefined,
          includeLogo,
        }),
      })

      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Media generation failed')
      }

      const result: MediaResult = await res.json()
      const entry: HistoryEntry = { result, note }

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
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Canva design creation failed')
      }
      const { editUrl } = await res.json() as { editUrl: string }
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

  function acceptFromLibrary(item: LibraryItem) {
    if (!onAccept) return
    onAccept({
      type: 'image',
      url: item.url,
      storagePath: item.storage_path ?? item.storagePath ?? '',
      promptUsed: item.prompt ?? '',
      altText: item.alt_text ?? item.prompt ?? 'Generated image',
    })
  }

  return (
    <>
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-zinc-800">
        <button
          onClick={() => setActiveTab('generate')}
          className={cn(
            'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
            activeTab === 'generate'
              ? 'border-violet-500 text-white'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
          )}
        >
          <ImageIcon className="w-3.5 h-3.5" />
          Generate
        </button>
        <button
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
          {libraryItems.length > 0 && (
            <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded-full">
              {libraryItems.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'generate' ? (
        <>
          {/* Media mode toggle */}
          <div className="flex gap-1 p-2 border-b border-zinc-800 bg-zinc-900/50">
            <button
              onClick={() => setMediaMode('image')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors',
                mediaMode === 'image' ? 'bg-violet-600 text-white' : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              <ImageIcon className="w-3 h-3" />
              Image
            </button>
            <button
              onClick={() => setMediaMode('video')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors',
                mediaMode === 'video' ? 'bg-violet-600 text-white' : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              <Film className="w-3 h-3" />
              Video
            </button>
          </div>

          {mediaMode === 'video' ? (
            <>
              <div className="relative bg-zinc-900 min-h-[240px] flex items-center justify-center">
                {videoJob.phase === 'running' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900/90 z-10 gap-3">
                    <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
                    <p className="text-sm text-zinc-400">Generating video… {videoJob.progress}%</p>
                    <p className="text-xs text-zinc-600">This can take a minute or two</p>
                  </div>
                )}

                {videoJob.phase === 'starting' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900/90 z-10 gap-3">
                    <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
                    <p className="text-sm text-zinc-400">Starting video job…</p>
                  </div>
                )}

                {videoJob.phase === 'idle' && (
                  <div className="flex flex-col items-center gap-3 py-12 text-zinc-600">
                    <Film className="w-10 h-10" />
                    <p className="text-sm">Generate a short video clip for this post</p>
                  </div>
                )}

                {videoJob.phase === 'done' && (
                  <HoverDownloadVideo
                    src={videoJob.result.url}
                    className="w-full max-h-[480px]"
                    wrapperClassName="w-full"
                  />
                )}
              </div>

              {videoJob.phase === 'error' && (
                <div className="flex items-center gap-2 px-4 py-2 bg-red-950/50 border-t border-red-900/50">
                  <X className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  <p className="text-xs text-red-400">{videoJob.message}</p>
                </div>
              )}

              <div className="p-4 space-y-3 border-t border-zinc-800">
                <ImagePromptBox
                  label="Video prompt"
                  value={videoPromptDraft}
                  onChange={setVideoPromptDraft}
                  placeholder="Describe the short clip you want to generate…"
                  hint={videoPromptLoading ? 'Crafting a suggested prompt…' : 'Edit before generating, or regenerate the suggestion.'}
                />

                <button
                  onClick={suggestVideoPrompt}
                  disabled={videoPromptLoading}
                  className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-400 transition-colors disabled:opacity-40"
                >
                  <RefreshCw className={cn('w-3 h-3', videoPromptLoading && 'animate-spin')} />
                  Suggest a new prompt
                </button>

                <div className="flex gap-2">
                  {videoJob.phase !== 'done' ? (
                    <button
                      onClick={generateVideo}
                      disabled={!videoPromptDraft.trim() || videoJob.phase === 'starting' || videoJob.phase === 'running'}
                      className="flex-1 flex items-center justify-center gap-2 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {videoJob.phase === 'starting' || videoJob.phase === 'running' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Film className="w-4 h-4" />
                      )}
                      Generate video
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={acceptVideo}
                        className="flex-1 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        Use this video
                      </button>
                      <button
                        onClick={resetVideoJob}
                        className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-medium transition-colors"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Regenerate
                      </button>
                    </>
                  )}
                </div>
              </div>
            </>
          ) : (
          <>
          {/* Media display */}
          <div className="relative bg-zinc-900 min-h-[240px] flex items-center justify-center">
            {/* Iteration nav */}
            {history.length > 1 && (
              <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
                <button
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
              <div className="flex flex-col items-center gap-3 py-12 text-zinc-600">
                <ImageIcon className="w-10 h-10" />
                <p className="text-sm">Generate an image for this post</p>
              </div>
            )}

            {current && (
              <HoverDownloadImage
                src={current.result.url}
                alt={current.result.altText}
                className="w-full object-contain max-h-[480px]"
                wrapperClassName="w-full"
                buttonClassName={history.length > 1 ? 'top-2 left-2 right-auto' : undefined}
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
              label={suggestedPrompt ? 'Suggested / custom image prompt' : 'Image prompt (optional)'}
              value={promptDraft}
              onChange={setPromptDraft}
              hint="Edit and generate from this prompt, or leave blank to auto-craft from post content."
            />

            {history.length > 0 && iterationsLeft > 0 && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={refinementNote}
                  onChange={e => setRefinementNote(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && generate(refinementNote, false)}
                  placeholder={`Refine… (${iterationsLeft} left)`}
                  className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500"
                />
                <button
                  onClick={() => generate(refinementNote, false)}
                  disabled={loading || !refinementNote.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Refine
                </button>
              </div>
            )}

            {iterationsLeft === 0 && (
              <p className="text-xs text-zinc-600 text-center">Max iterations reached.</p>
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
                <button
                  onClick={() => generate('', Boolean(promptDraft.trim()))}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                  {promptDraft.trim() ? 'Generate from prompt' : 'Generate'}
                </button>
              ) : (
                <>
                  <button
                    onClick={acceptMedia}
                    className="flex-1 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Use this image
                  </button>
                  <button
                    onClick={sendToCanva}
                    disabled={canvaLoading}
                    className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                    title="Open in Canva to edit"
                  >
                    {canvaLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LayoutTemplate className="w-4 h-4" />}
                    Edit in Canva
                    {canvaUrl && <ExternalLink className="w-3 h-3" />}
                  </button>
                </>
              )}
            </div>

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
        </>
          )}
        </>
      ) : (
        /* Library tab */
        <div className="p-4">
          {libraryLoading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-zinc-600">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading library…</span>
            </div>
          ) : libraryError ? (
            <p className="text-sm text-red-400 text-center py-8">{libraryError}</p>
          ) : libraryItems.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-zinc-600">
              <Library className="w-8 h-8" />
              <p className="text-sm text-center">No images in library yet.<br />Generate one to start building your catalog.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-zinc-500">{libraryItems.length} image{libraryItems.length !== 1 ? 's' : ''}</p>
                <button
                  onClick={loadLibrary}
                  className="text-xs text-zinc-600 hover:text-zinc-400 flex items-center gap-1 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Refresh
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 max-h-[420px] overflow-y-auto pr-0.5">
                {libraryItems.map(item => (
                  <div key={item.id} className="group relative aspect-square bg-zinc-900 rounded-lg overflow-hidden border border-zinc-800 hover:border-violet-500/50 transition-colors">
                    <HoverDownloadImage
                      src={item.url}
                      alt={item.alt_text ?? item.prompt ?? ''}
                      className="w-full h-full object-cover"
                      wrapperClassName="w-full h-full"
                      downloadFilename={`media-${item.id}.png`}
                    />

                    {/* Hover actions */}
                    <div className="absolute inset-0 bg-zinc-900/80 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2 pointer-events-none">
                      <button
                        type="button"
                        onClick={() => acceptFromLibrary(item)}
                        className="pointer-events-auto px-2 py-1 bg-violet-600 hover:bg-violet-500 text-white rounded text-[11px] font-medium w-full transition-colors"
                      >
                        Use this image
                      </button>
                      <button
                        type="button"
                        onClick={() =>                         setExpandedItem({
                          id: item.id,
                          url: item.url,
                          prompt: item.prompt,
                          alt_text: item.alt_text,
                          type: 'image',
                          svg: null,
                          storage_path: item.storage_path ?? item.storagePath,
                          post_id: null,
                          created_at: item.created_at,
                          posts: null,
                        })}
                        className="pointer-events-auto flex items-center justify-center gap-1 px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded text-[11px] w-full transition-colors"
                      >
                        <Maximize2 className="w-3 h-3" />
                        View &amp; edit in Canva
                      </button>
                    </div>

                    {item.prompt && (
                      <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 bg-zinc-950/90 pointer-events-none">
                        <p className="text-[8px] text-zinc-500 line-clamp-2 leading-tight">{item.prompt}</p>
                      </div>
                    )}
                    <div className="absolute top-1.5 left-1.5 right-1.5 flex items-center justify-between pointer-events-none">
                      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-blue-900/80 text-blue-300">
                        Image
                      </span>
                      <span className="text-[9px] text-zinc-500 bg-zinc-900/80 px-1 py-0.5 rounded">
                        {format(new Date(item.created_at), 'MMM d')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
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
