'use client'

import { useState, useRef } from 'react'
import { Bold, Italic, List, ImageIcon, CalendarClock, RefreshCw, Check, Loader2, CircleCheck, GitBranch } from 'lucide-react'
import { buildStatusDatetimePayload } from '@/lib/content-status'
import { postHasThread } from '@/lib/generate/x-thread'
import { GenerateForm } from './GenerateForm'
import { PostPreview } from './PostPreview'
import { MediaPanel } from './MediaPanel'
import { XThreadEditor } from './XThreadEditor'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { XIcon } from '@/components/ui/channel-icons'
import { cn } from '@/lib/utils'
import type { Channel } from '@/types/database'
import type { GeneratedPost, ThreadTweet } from '@/types/agents'

import { mediaItemFromResult, type MediaResult } from '@/types/media'

interface GeneratePageClientProps {
  companyId: string
  brandColors?: { primary?: string; accent?: string }
}

// ─── X Thread viewer ─────────────────────────────────────────────────────────

interface ThreadViewerProps {
  post: GeneratedPost
  companyId: string
  brandColors?: { primary?: string; accent?: string }
  onReset: () => void
}

function ThreadViewer({ post, companyId, brandColors, onReset }: ThreadViewerProps) {
  const thread = (post.contentVariants?.thread ?? []) as ThreadTweet[]

  return (
    <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center gap-2">
          <XIcon className="w-4 h-4 text-zinc-300" />
          <span className="text-sm font-medium text-zinc-300">Thread</span>
          <span className="text-xs text-zinc-600">· {thread.length} tweets</span>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          New
        </button>
      </div>
      <XThreadEditor post={post} companyId={companyId} brandColors={brandColors} />
    </div>
  )
}

// ─── Multi-channel batch previewer ───────────────────────────────────────────

type SaveState = 'idle' | 'saving' | 'draft' | 'scheduled' | 'published'

interface MultiPostPreviewerProps {
  posts: GeneratedPost[]
  batchErrors: string[]
  companyId: string
  brandColors?: { primary?: string; accent?: string }
  onReset: () => void
}

function MultiPostPreviewer({ posts, batchErrors, companyId, brandColors, onReset }: MultiPostPreviewerProps) {
  const [activeIdx, setActiveIdx] = useState(0)
  const [edits, setEdits] = useState<Record<number, string>>(
    Object.fromEntries(posts.map((p, i) => [i, p.content.split('\n--\nIMAGE_PROMPT:')[0].trim()]))
  )
  const [saveStates, setSaveStates] = useState<Record<number, SaveState>>(
    Object.fromEntries(posts.map((_, i) => [i, 'idle' as SaveState]))
  )
  const [showSchedule, setShowSchedule] = useState<number | null>(null)
  const [scheduledFor, setScheduledFor] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [postMedia, setPostMedia] = useState<Record<number, MediaResult>>({})

  function handleMediaAccept(result: MediaResult) {
    setPostMedia(prev => ({ ...prev, [activeIdx]: result }))
  }

  const activePost = posts[activeIdx]
  const activeIsThread = postHasThread(activePost)
  const activeContent = edits[activeIdx] ?? ''
  const activeSave = saveStates[activeIdx]

  function applyFormatting(type: 'bold' | 'italic' | 'bullet') {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const val = activeContent
    const before = val.slice(0, start)
    const selected = val.slice(start, end)
    const after = val.slice(end)
    let next = val
    let ns = start
    let ne = end

    if (type === 'bold') {
      next = `${before}**${selected}**${after}`; ns = start + 2; ne = end + 2
    } else if (type === 'italic') {
      next = `${before}_${selected}_${after}`; ns = start + 1; ne = end + 1
    } else {
      if (selected) {
        const bulleted = selected.split('\n').map(l => l.startsWith('• ') ? l : `• ${l}`).join('\n')
        next = `${before}${bulleted}${after}`; ne = start + bulleted.length
      } else {
        const ls = before.lastIndexOf('\n') + 1
        next = `${val.slice(0, ls)}• ${val.slice(ls)}`; ns = start + 2; ne = end + 2
      }
    }

    setEdits(prev => ({ ...prev, [activeIdx]: next }))
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(ns, ne) })
  }

  async function savePost(status: 'draft' | 'scheduled' | 'published', scheduleDatetime?: string) {
    setSaveStates(prev => ({ ...prev, [activeIdx]: 'saving' }))
    const mediaToUse = postMedia[activeIdx]
    const statusPayload = buildStatusDatetimePayload(
      status,
      status === 'scheduled' ? (scheduleDatetime ?? '') : '',
    )
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          channel: activePost.channel,
          content: activeContent,
          ai_generated: true,
          generation_params: { imagePrompt: activePost.imagePrompt },
          content_variants: activePost.contentVariants ?? {},
          media_items: mediaToUse ? [mediaItemFromResult(mediaToUse)] : [],
          ...statusPayload,
        }),
      })
      if (res.ok) {
        setSaveStates(prev => ({
          ...prev,
          [activeIdx]: status === 'draft' ? 'draft' : status === 'scheduled' ? 'scheduled' : 'published',
        }))
        setShowSchedule(null)
        setScheduledFor('')
      } else {
        setSaveStates(prev => ({ ...prev, [activeIdx]: 'idle' }))
      }
    } catch {
      setSaveStates(prev => ({ ...prev, [activeIdx]: 'idle' }))
    }
  }

  const activePostMedia = postMedia[activeIdx]

  return (
    <>
    <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900">
      {/* Channel tabs */}
      <div className="flex items-stretch border-b border-zinc-800 bg-zinc-900/50">
        {posts.map((post, i) => (
          <button
            key={post.channel}
            onClick={() => { setActiveIdx(i); setShowSchedule(null) }}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeIdx === i ? 'border-violet-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'
            )}
          >
            <Badge variant={post.channel as Channel}>{post.channel}</Badge>
            {postHasThread(post) && <GitBranch className="w-3 h-3 text-sky-400" aria-label="Thread" />}
            {saveStates[i] === 'draft' && <Check className="w-3 h-3 text-green-400" />}
            {saveStates[i] === 'scheduled' && <CalendarClock className="w-3 h-3 text-yellow-400" />}
            {saveStates[i] === 'published' && <CircleCheck className="w-3 h-3 text-emerald-400" />}
          </button>
        ))}
        <div className="flex-1 flex justify-end items-center pr-3">
          <button
            onClick={onReset}
            className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            New
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="p-4 space-y-3">
        {activeIsThread ? (
          <XThreadEditor
            key={activeIdx}
            post={activePost}
            companyId={companyId}
            brandColors={brandColors}
            embedded
          />
        ) : (
          <>
        <div className="flex items-center gap-0.5 border border-zinc-800 rounded-lg p-1 w-fit">
          {([
            { type: 'bold' as const, icon: <Bold className="w-3.5 h-3.5" /> },
            { type: 'italic' as const, icon: <Italic className="w-3.5 h-3.5" /> },
            { type: 'bullet' as const, icon: <List className="w-3.5 h-3.5" /> },
          ]).map(({ type, icon }) => (
            <button
              key={type}
              type="button"
              onMouseDown={e => { e.preventDefault(); applyFormatting(type) }}
              className="p-1.5 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              {icon}
            </button>
          ))}
        </div>

        <textarea
          ref={textareaRef}
          value={activeContent}
          onChange={e => setEdits(prev => ({ ...prev, [activeIdx]: e.target.value }))}
          rows={12}
          className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-200 leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-violet-500/60"
        />
        {activePost.channel === 'x' && !activeIsThread && (
          <p className={cn('text-xs text-right', activeContent.length > 280 ? 'text-red-400' : 'text-zinc-600')}>
            {activeContent.length}/280
          </p>
        )}

        {activeSave === 'draft' ? (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-sm text-green-400">
              <Check className="w-4 h-4" /> Saved as draft
            </span>
            <button
              onClick={() => setSaveStates(prev => ({ ...prev, [activeIdx]: 'idle' }))}
              className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Edit again
            </button>
          </div>
        ) : activeSave === 'scheduled' ? (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-sm text-yellow-400">
              <CalendarClock className="w-4 h-4" /> Scheduled
            </span>
            <button
              onClick={() => setSaveStates(prev => ({ ...prev, [activeIdx]: 'idle' }))}
              className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Edit again
            </button>
          </div>
        ) : activeSave === 'published' ? (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-sm text-emerald-400">
              <CircleCheck className="w-4 h-4" /> Marked as published
            </span>
            <button
              onClick={() => setSaveStates(prev => ({ ...prev, [activeIdx]: 'idle' }))}
              className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Edit again
            </button>
          </div>
        ) : activeSave === 'saving' ? (
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Saving…
          </div>
        ) : showSchedule === activeIdx ? (
          <div className="space-y-2 pt-1 border-t border-zinc-800">
            <p className="text-xs text-zinc-500">Pick a publish time</p>
            <input
              type="datetime-local"
              value={scheduledFor}
              onChange={e => setScheduledFor(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500 [color-scheme:dark]"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => savePost('scheduled', scheduledFor)}
                disabled={!scheduledFor}
              >
                Confirm schedule
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setShowSchedule(null); setScheduledFor('') }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-zinc-800">
            <Button size="sm" onClick={() => savePost('draft')}>
              Save as draft
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowSchedule(activeIdx)}>
              <CalendarClock className="w-3.5 h-3.5" />
              Schedule
            </Button>
            <Button size="sm" variant="outline" onClick={() => savePost('published')}>
              <CircleCheck className="w-3.5 h-3.5" />
              Mark published
            </Button>
            <button
              onClick={() => setEdits(prev => ({
                ...prev,
                [activeIdx]: posts[activeIdx].content.split('\n--\nIMAGE_PROMPT:')[0].trim(),
              }))}
              className="ml-auto text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Discard edits
            </button>
          </div>
        )}
          </>
        )}

        {batchErrors.length > 0 && (
          <div className="rounded-lg border border-red-800 bg-red-900/20 p-3 space-y-1">
            {batchErrors.map((err, i) => (
              <p key={i} className="text-xs text-red-300">{err}</p>
            ))}
          </div>
        )}
      </div>
    </div>

    {!activeIsThread && activePostMedia && (
      <div className="rounded-lg overflow-hidden border border-zinc-700">
        <div className="px-3 py-1.5 bg-zinc-800 flex items-center gap-1.5">
          <ImageIcon className="w-3 h-3 text-violet-400" />
          <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-wide">Image attached</span>
        </div>
        <img src={activePostMedia.url} alt={activePostMedia.altText} className="w-full object-contain max-h-48" />
      </div>
    )}

    {!activeIsThread && (
      <MediaPanel
        key={activeIdx}
        postContent={activeContent}
        companyId={companyId}
        channel={activePost.channel}
        brandColors={brandColors}
        suggestedPrompt={activePost.imagePrompt}
        onAccept={handleMediaAccept}
      />
    )}
    </>
  )
}

// ─── Main page client ─────────────────────────────────────────────────────────

export function GeneratePageClient({ companyId, brandColors }: GeneratePageClientProps) {
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null)
  const [content, setContent] = useState('')
  const [imagePrompt, setImagePrompt] = useState<string | undefined>()
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState('')
  const [lastParams] = useState<Record<string, unknown>>({})
  const [batchPosts, setBatchPosts] = useState<GeneratedPost[]>([])
  const [batchErrors, setBatchErrors] = useState<string[]>([])
  // Increment this to force PostPreview to remount with fresh state on each new generation.
  // Without this, savedPostId + acceptedMedia from a previous post persist and "Update draft"
  // silently overwrites the old post instead of creating a new draft.
  const [generationKey, setGenerationKey] = useState(0)

  const isBatch = batchPosts.length > 0
  const isThread = batchPosts.length === 1 && postHasThread(batchPosts[0])

  function handleStream(channel: Channel) {
    setBatchPosts([]); setBatchErrors([])
    setActiveChannel(channel); setContent(''); setImagePrompt(undefined)
    setIsStreaming(true); setError('')
    setGenerationKey(k => k + 1)
  }

  function handleChunk(chunk: string) { setContent(prev => prev + chunk) }

  function handleDone(imgPrompt?: string) { setIsStreaming(false); setImagePrompt(imgPrompt) }

  function handleError(msg: string) { setIsStreaming(false); setError(msg) }

  function handleBatchGenerated(posts: GeneratedPost[], errors: string[]) {
    setBatchPosts(posts)
    setBatchErrors(errors)
    setActiveChannel(null)
    setContent('')
    setIsStreaming(false)
    setGenerationKey(k => k + 1)
  }

  function handleReset() {
    setActiveChannel(null); setContent(''); setImagePrompt(undefined)
    setError(''); setBatchPosts([]); setBatchErrors([])
    setGenerationKey(k => k + 1)
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Generate</h1>
          <p className="text-zinc-400 mt-1 text-sm">
            Select one channel for live streaming preview, or multiple to review and approve each post
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Left: form */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <GenerateForm
              companyId={companyId}
              onStream={handleStream}
              onChunk={handleChunk}
              onDone={handleDone}
              onError={handleError}
              onBatchGenerated={handleBatchGenerated}
            />
            {error && (
              <p className="mt-4 text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-4 py-3">
                {error}
              </p>
            )}
          </div>

          {/* Right: preview */}
          <div className="sticky top-8 space-y-4">
            {isThread ? (
              <ThreadViewer
                post={batchPosts[0]}
                companyId={companyId}
                brandColors={brandColors}
                onReset={handleReset}
              />
            ) : isBatch ? (
              <MultiPostPreviewer
                posts={batchPosts}
                batchErrors={batchErrors}
                companyId={companyId}
                brandColors={brandColors}
                onReset={handleReset}
              />
            ) : (
              <PostPreview
                key={generationKey}
                channel={activeChannel}
                content={content}
                imagePrompt={imagePrompt}
                isStreaming={isStreaming}
                companyId={companyId}
                brandColors={brandColors}
                onReset={handleReset}
                generationParams={lastParams}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
