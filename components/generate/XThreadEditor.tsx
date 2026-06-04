'use client'

import { useState, useRef } from 'react'
import { Bold, Italic, List, ImageIcon, CalendarClock, Check, Loader2, CircleCheck, X, Eye, Pencil } from 'lucide-react'
import { buildStatusDatetimePayload } from '@/lib/content-status'
import { threadMediaToPostItems } from '@/lib/posts/x-format'
import { XThreadPreview } from '@/components/posts/ChannelPreview'
import { HoverDownloadImage } from '@/components/media/HoverDownloadImage'
import { AltTextBox } from '@/components/media/AltTextBox'
import { MediaPanel } from './MediaPanel'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { mediaItemFromResult, type MediaResult } from '@/types/media'
import type { GeneratedPost, ThreadTweet } from '@/types/agents'
import type { MediaItem } from '@/types/database'

type SaveState = 'idle' | 'saving' | 'draft' | 'scheduled' | 'published'

interface XThreadEditorProps {
  post: GeneratedPost
  companyId: string
  brandColors?: { primary?: string; accent?: string }
  /** Hide top chrome when nested inside multi-channel tabs */
  embedded?: boolean
  voice?: 'personal' | 'company'
}

function mediaFromTweet(tweet: ThreadTweet): MediaItem | undefined {
  return tweet.media?.url ? tweet.media : undefined
}

export function XThreadEditor({ post, companyId, brandColors, embedded, voice = 'company' }: XThreadEditorProps) {
  const rawThread = (post.contentVariants?.thread ?? []) as ThreadTweet[]
  const [tweets, setTweets] = useState(() => rawThread.map(t => t.text))
  const [tweetMedia, setTweetMedia] = useState<Record<number, MediaItem>>(() => {
    const initial: Record<number, MediaItem> = {}
    rawThread.forEach((t, i) => {
      const media = mediaFromTweet(t)
      if (media) initial[i] = media
    })
    return initial
  })
  const [focusedIdx, setFocusedIdx] = useState(0)
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduledFor, setScheduledFor] = useState('')
  const [savedPostId, setSavedPostId] = useState<string | null>(null)
  const textareaRefs = useRef<(HTMLTextAreaElement | null)[]>([])

  const threadContent = tweets.join('\n\n---\n\n')
  const suggestedPrompt =
    rawThread[focusedIdx]?.imagePrompt ?? post.imagePrompt
  const focusedMedia = tweetMedia[focusedIdx]

  function applyFormatting(type: 'bold' | 'italic' | 'bullet') {
    const ta = textareaRefs.current[focusedIdx]
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const val = tweets[focusedIdx]
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
    setTweets(prev => { const a = [...prev]; a[focusedIdx] = next; return a })
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(ns, ne) })
  }

  function buildUpdatedThread(): ThreadTweet[] {
    return rawThread.map((t, i) => ({
      ...t,
      text: tweets[i] ?? t.text,
      ...(tweetMedia[i] ? { media: tweetMedia[i] } : {}),
    }))
  }

  async function handleMediaAccept(media: MediaResult) {
    const item = mediaItemFromResult(media)
    setTweetMedia(prev => ({ ...prev, [focusedIdx]: item }))

    if (savedPostId) {
      const updatedThread = rawThread.map((t, i) => ({
        ...t,
        text: tweets[i] ?? t.text,
        ...(i === focusedIdx ? { media: item } : tweetMedia[i] ? { media: tweetMedia[i] } : {}),
      }))
      await fetch(`/api/posts/${savedPostId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content_variants: { thread: updatedThread },
          media_items: threadMediaToPostItems(updatedThread),
        }),
      })
    }
  }

  function removeTweetMedia(index: number) {
    setTweetMedia(prev => {
      const next = { ...prev }
      delete next[index]
      return next
    })
  }

  async function saveThread(status: 'draft' | 'scheduled' | 'published', scheduleDatetime?: string) {
    setSaveState('saving')
    try {
      const updatedThread = buildUpdatedThread()
      const statusPayload = buildStatusDatetimePayload(
        status,
        status === 'scheduled' ? (scheduleDatetime ?? '') : '',
      )
      const body = {
        content: threadContent,
        ai_generated: true,
        generation_params: { imagePrompt: post.imagePrompt },
        content_variants: { thread: updatedThread },
        media_items: threadMediaToPostItems(updatedThread),
        ...statusPayload,
      }

      if (savedPostId) {
        const res = await fetch(`/api/posts/${savedPostId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error('update failed')
      } else {
        const res = await fetch('/api/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            company_id: companyId,
            channel: 'x',
            ...body,
          }),
        })
        if (!res.ok) throw new Error('save failed')
        const created = await res.json() as { id: string }
        setSavedPostId(created.id)
      }

      setSaveState(status === 'draft' ? 'draft' : status === 'scheduled' ? 'scheduled' : 'published')
      setShowSchedule(false)
      setScheduledFor('')
    } catch {
      setSaveState('idle')
    }
  }

  const tweetLabels = (i: number) =>
    i === 0 ? 'Hook' : i === tweets.length - 1 ? 'Close' : `Tweet ${i + 1}`

  const previewDisplayName = voice === 'personal' ? 'You' : 'Company'
  const previewHandle = voice === 'personal' ? 'you' : 'company'
  const previewTweets = tweets.map((text, i) => ({
    text,
    mediaUrl: tweetMedia[i]?.url,
    mediaAlt: tweetMedia[i]?.alt_text ?? undefined,
  }))

  return (
    <div className={cn('space-y-3', !embedded && 'p-4')}>
      <div className="flex items-center justify-between gap-3">
        {!embedded ? (
          <p className="text-xs text-zinc-500">
            {tweets.length} tweets · click a tweet to attach media to it
          </p>
        ) : (
          <p className="text-xs text-zinc-500">{tweets.length} tweets</p>
        )}
        <div className="flex items-center rounded-lg border border-zinc-700 overflow-hidden shrink-0">
          <button
            type="button"
            onClick={() => setViewMode('edit')}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1 text-xs transition-colors',
              viewMode === 'edit'
                ? 'bg-zinc-700 text-white'
                : 'text-zinc-500 hover:text-zinc-300',
            )}
          >
            <Pencil className="w-3 h-3" /> Edit
          </button>
          <button
            type="button"
            onClick={() => setViewMode('preview')}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1 text-xs transition-colors',
              viewMode === 'preview'
                ? 'bg-zinc-700 text-white'
                : 'text-zinc-500 hover:text-zinc-300',
            )}
          >
            <Eye className="w-3 h-3" /> Preview
          </button>
        </div>
      </div>

      {viewMode === 'preview' ? (
        <XThreadPreview
          tweets={previewTweets}
          displayName={previewDisplayName}
          handle={previewHandle}
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
            title={type}
          >
            {icon}
          </button>
        ))}
        <span className="ml-1.5 text-[10px] text-zinc-700 pl-1.5 border-l border-zinc-800">
          applies to focused tweet
        </span>
      </div>

      <div className="space-y-2 max-h-[440px] overflow-y-auto pr-0.5">
        {tweets.map((text, i) => {
          const imageHint = rawThread[i]?.imagePrompt
          const attached = tweetMedia[i]
          const over = text.length > 280
          return (
            <div
              key={i}
              className={cn(
                'rounded-lg border p-3 space-y-2 transition-colors',
                focusedIdx === i
                  ? 'border-violet-500/40 bg-zinc-800/30'
                  : 'border-zinc-800 bg-zinc-800/10',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">
                  {tweetLabels(i)}
                  {attached && (
                    <span className="ml-2 normal-case text-violet-400/80 font-normal">· image attached</span>
                  )}
                </span>
                <span className={cn('text-[11px] tabular-nums', over ? 'text-red-400 font-medium' : 'text-zinc-600')}>
                  {text.length}/280
                </span>
              </div>
              <textarea
                ref={el => { textareaRefs.current[i] = el }}
                value={text}
                onChange={e => setTweets(prev => { const a = [...prev]; a[i] = e.target.value; return a })}
                onFocus={() => setFocusedIdx(i)}
                rows={3}
                className="w-full bg-transparent text-sm text-zinc-200 leading-relaxed resize-none focus:outline-none placeholder:text-zinc-600"
              />
              {attached && (
                <div className="rounded-lg overflow-hidden border border-zinc-700">
                  <div className="px-2 py-1 bg-zinc-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <ImageIcon className="w-3 h-3 text-violet-400" />
                      <span className="text-[10px] text-zinc-400">Media for this tweet</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeTweetMedia(i)}
                      className="p-0.5 text-zinc-600 hover:text-red-400 transition-colors"
                      title="Remove image"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <HoverDownloadImage
                    src={attached.url}
                    alt={attached.alt_text ?? 'Tweet image'}
                    className="w-full object-contain max-h-32"
                    wrapperClassName="w-full"
                  />
                </div>
              )}
              {imageHint && !attached && (
                <div className="flex items-start gap-1.5 text-[11px] text-amber-400/80 bg-amber-500/5 border border-amber-500/20 rounded px-2 py-1.5">
                  <ImageIcon className="w-3 h-3 mt-0.5 shrink-0 text-amber-400" />
                  <span className="leading-relaxed">{imageHint}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
        </>
      )}

      {saveState === 'draft' ? (
        <div className="flex items-center gap-3 pt-1 border-t border-zinc-800">
          <span className="flex items-center gap-1.5 text-sm text-green-400">
            <Check className="w-4 h-4" /> Thread saved as draft
          </span>
          <button type="button" onClick={() => setSaveState('idle')} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
            Edit again
          </button>
        </div>
      ) : saveState === 'scheduled' ? (
        <div className="flex items-center gap-3 pt-1 border-t border-zinc-800">
          <span className="flex items-center gap-1.5 text-sm text-yellow-400">
            <CalendarClock className="w-4 h-4" /> Thread scheduled
          </span>
          <button type="button" onClick={() => setSaveState('idle')} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
            Edit again
          </button>
        </div>
      ) : saveState === 'published' ? (
        <div className="flex items-center gap-3 pt-1 border-t border-zinc-800">
          <span className="flex items-center gap-1.5 text-sm text-emerald-400">
            <CircleCheck className="w-4 h-4" /> Thread marked published
          </span>
          <button type="button" onClick={() => setSaveState('idle')} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
            Edit again
          </button>
        </div>
      ) : saveState === 'saving' ? (
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Saving…
        </div>
      ) : showSchedule ? (
        <div className="space-y-2 pt-1 border-t border-zinc-800">
          <p className="text-xs text-zinc-500">Pick a publish time</p>
          <input
            type="datetime-local"
            value={scheduledFor}
            onChange={e => setScheduledFor(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500 [color-scheme:dark]"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => saveThread('scheduled', scheduledFor)} disabled={!scheduledFor}>
              Confirm schedule
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowSchedule(false); setScheduledFor('') }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-zinc-800">
          <Button size="sm" onClick={() => saveThread('draft')}>Save as draft</Button>
          <Button size="sm" variant="outline" onClick={() => setShowSchedule(true)}>
            <CalendarClock className="w-3.5 h-3.5" />
            Schedule
          </Button>
          <Button size="sm" variant="outline" onClick={() => saveThread('published')}>
            <CircleCheck className="w-3.5 h-3.5" />
            Mark published
          </Button>
          <button
            type="button"
            onClick={() => {
              setTweets(rawThread.map(t => t.text))
              setTweetMedia(() => {
                const initial: Record<number, MediaItem> = {}
                rawThread.forEach((t, idx) => {
                  const media = mediaFromTweet(t)
                  if (media) initial[idx] = media
                })
                return initial
              })
            }}
            className="ml-auto text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            Discard edits
          </button>
        </div>
      )}

      {viewMode === 'edit' && (
      <div className="rounded-lg border border-zinc-800 p-3 space-y-2">
        <p className="text-xs text-zinc-500">
          Add media to <span className="text-zinc-300">{tweetLabels(focusedIdx)}</span>
          {focusedMedia && ' (replacing current image)'}
        </p>
        {focusedMedia && (
          <div className="px-1">
            <AltTextBox value={focusedMedia.alt_text ?? ''} />
          </div>
        )}
        <MediaPanel
          postContent={tweets[focusedIdx] ?? ''}
          companyId={companyId}
          channel="x"
          brandColors={brandColors}
          postId={savedPostId ?? undefined}
          suggestedPrompt={suggestedPrompt}
          onAccept={handleMediaAccept}
        />
      </div>
      )}
    </div>
  )
}
