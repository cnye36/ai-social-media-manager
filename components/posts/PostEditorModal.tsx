'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import {
  Bold, Italic, List, Copy, Check, Trash2, CalendarClock,
  Image as ImageIcon, CheckCircle2, ChevronDown, ChevronUp,
  X as XIcon, Wand2, Loader2,
} from 'lucide-react'
import { SendToBufferButton } from '@/components/posts/SendToBufferButton'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AltTextBox } from '@/components/media/AltTextBox'
import { MediaPanel } from '@/components/generate/MediaPanel'
import { mediaItemFromResult, type MediaResult } from '@/types/media'
import { ChannelPreview, XThreadPreview } from '@/components/posts/ChannelPreview'
import { cn } from '@/lib/utils'
import type { Post, Channel, PostStatus, MediaItem } from '@/types/database'
import type { ThreadTweet } from '@/types/agents'
import { postBodyForPublish } from '@/lib/generate/image-prompt'
import {
  isXThreadPost,
  parseThreadTweets,
  threadMediaToPostItems,
  X_THREAD_CONTENT_SEPARATOR,
} from '@/lib/posts/x-format'
import {
  buildStatusDatetimePayload,
  datetimeFieldLabel,
  initialDatetimeLocal,
  onDatetimeChange,
  onStatusSelect,
  syncDatetimeFieldsFromSaved,
  toDatetimeLocal,
} from '@/lib/content-status'

const SOCIAL_CHANNELS: Channel[] = ['linkedin', 'x', 'facebook']
const STATUSES: PostStatus[] = ['draft', 'scheduled', 'published', 'archived']

function FormattingRibbon({ onFormat }: { onFormat: (type: 'bold' | 'italic' | 'bullet') => void }) {
  return (
    <div className="flex items-center gap-0.5 border border-zinc-800 rounded-lg p-1 w-fit">
      {([
        { type: 'bold' as const, icon: <Bold className="w-3.5 h-3.5" />, title: 'Bold' },
        { type: 'italic' as const, icon: <Italic className="w-3.5 h-3.5" />, title: 'Italic' },
        { type: 'bullet' as const, icon: <List className="w-3.5 h-3.5" />, title: 'Bullet' },
      ]).map(({ type, icon, title }) => (
        <button
          key={type}
          type="button"
          onMouseDown={e => { e.preventDefault(); onFormat(type) }}
          title={title}
          className="p-1.5 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          {icon}
        </button>
      ))}
    </div>
  )
}

interface PostEditorModalProps {
  post: Post | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate?: (post: Post) => void
  onDelete?: (id: string) => void
  companyId: string
  brandColors?: { primary?: string; accent?: string }
}

export function PostEditorModal({
  post, open, onOpenChange, onUpdate, onDelete, companyId, brandColors,
}: PostEditorModalProps) {
  // ─── Single-post state ─────────────────────────────────────────────────────
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<PostStatus>('draft')
  const [scheduledFor, setScheduledFor] = useState('')
  const [pendingMediaUrl, setPendingMediaUrl] = useState<string | null>(null)
  const [pendingMediaItems, setPendingMediaItems] = useState<Post['media_items'] | null>(null)
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [approveState, setApproveState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [approveError, setApproveError] = useState('')
  const [bufferPostId, setBufferPostId] = useState<string | null>(null)
  const [showMedia, setShowMedia] = useState(false)

  // ─── Quality score ─────────────────────────────────────────────────────────
  const [postScore, setPostScore] = useState<number | null>(null)
  const [scoreIssues, setScoreIssues] = useState<string[]>([])
  const [scoreLoading, setScoreLoading] = useState(false)
  const [fixingIssue, setFixingIssue] = useState<string | null>(null)
  const [fixError, setFixError] = useState('')
  const scoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─── Thread state ──────────────────────────────────────────────────────────
  const [rawParsedThread, setRawParsedThread] = useState<ThreadTweet[]>([])
  const [threadTweets, setThreadTweets] = useState<string[]>([])
  const [tweetMedia, setTweetMedia] = useState<Record<number, MediaItem>>({})
  const [focusedTweetIdx, setFocusedTweetIdx] = useState(0)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const threadTextareaRefs = useRef<(HTMLTextAreaElement | null)[]>([])

  const isThread = post ? isXThreadPost(post) : false

  useEffect(() => {
    if (post && open) {
      setContent(postBodyForPublish(post.content))
      setStatus(post.status as PostStatus)
      setScheduledFor(initialDatetimeLocal(
        post.status as PostStatus,
        post.scheduled_for,
        post.published_at,
      ))
      setPendingMediaUrl(null)
      setPendingMediaItems(null)
      setSaveError('')
      setSaveSuccess(false)
      setApproveState('idle')
      setApproveError('')
      setBufferPostId(post.buffer_post_id)
      setShowMedia(false)
      setPostScore(null)
      setScoreIssues([])

      if (isXThreadPost(post)) {
        const parsed = parseThreadTweets(post)
        setRawParsedThread(parsed)
        setThreadTweets(parsed.map(t => t.text))
        const mediaMap: Record<number, MediaItem> = {}
        parsed.forEach((t, i) => { if (t.media?.url) mediaMap[i] = t.media })
        setTweetMedia(mediaMap)
        setFocusedTweetIdx(0)
      }
    }
  }, [post?.id, open])

  const scoreContent = useCallback(async (text: string, ch: Channel) => {
    setScoreLoading(true)
    try {
      const res = await fetch('/api/posts/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text, channel: ch }),
      })
      if (res.ok) {
        const { score, issues } = await res.json() as { score: number; issues: string[] }
        setPostScore(score)
        setScoreIssues(issues)
      }
    } finally {
      setScoreLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isThread || !post || content.length < 60) {
      setPostScore(null)
      setScoreIssues([])
      return
    }
    if (scoreTimerRef.current) clearTimeout(scoreTimerRef.current)
    scoreTimerRef.current = setTimeout(() => {
      void scoreContent(content, post.channel as Channel)
    }, 700)
    return () => { if (scoreTimerRef.current) clearTimeout(scoreTimerRef.current) }
  }, [content, isThread, post, scoreContent])

  async function handleFixIssue(issue: string) {
    if (!post) return
    setFixingIssue(issue)
    setFixError('')
    try {
      const res = await fetch(`/api/posts/${post.id}/fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, instruction: issue }),
      })
      if (res.ok) {
        const data = await res.json() as { content: string }
        setContent(data.content)
        const saveRes = await fetch(`/api/posts/${post.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: postBodyForPublish(data.content) }),
        })
        if (saveRes.ok) onUpdate?.(await saveRes.json() as Post)
        await scoreContent(data.content, post.channel as Channel)
      } else {
        const d = await res.json().catch(() => ({}))
        setFixError(typeof d.error === 'string' ? d.error : 'Fix failed')
      }
    } catch {
      setFixError('Fix failed')
    } finally {
      setFixingIssue(null)
    }
  }

  function applyFormattingToSingle(type: 'bold' | 'italic' | 'bullet') {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const before = content.slice(0, start)
    const selected = content.slice(start, end)
    const after = content.slice(end)
    let newContent = content
    let newStart = start
    let newEnd = end

    if (type === 'bold') {
      newContent = `${before}**${selected}**${after}`
      newStart = start + 2; newEnd = end + 2
    } else if (type === 'italic') {
      newContent = `${before}_${selected}_${after}`
      newStart = start + 1; newEnd = end + 1
    } else {
      if (selected) {
        const bulleted = selected.split('\n').map(l => l.startsWith('• ') ? l : `• ${l}`).join('\n')
        newContent = `${before}${bulleted}${after}`
        newEnd = start + bulleted.length
      } else {
        const lineStart = before.lastIndexOf('\n') + 1
        newContent = `${content.slice(0, lineStart)}• ${content.slice(lineStart)}`
        newStart = start + 2; newEnd = end + 2
      }
    }

    setContent(newContent)
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(newStart, newEnd) })
  }

  function applyFormattingToThread(type: 'bold' | 'italic' | 'bullet') {
    const ta = threadTextareaRefs.current[focusedTweetIdx]
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const val = threadTweets[focusedTweetIdx]
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
    setThreadTweets(prev => { const a = [...prev]; a[focusedTweetIdx] = next; return a })
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(ns, ne) })
  }

  function buildUpdatedThread(): ThreadTweet[] {
    return rawParsedThread.map((t, i) => {
      const { media: _omit, ...base } = t
      const updated = { ...base, text: threadTweets[i] ?? t.text }
      const media = tweetMedia[i]
      return media ? { ...updated, media } : updated
    })
  }

  async function handleSave() {
    if (!post) return
    setSaving(true); setSaveError('')

    let bodyPayload: Record<string, unknown>

    if (isThread) {
      const updatedThread = buildUpdatedThread()
      bodyPayload = {
        content: threadTweets.join(X_THREAD_CONTENT_SEPARATOR),
        content_variants: { thread: updatedThread },
        media_items: threadMediaToPostItems(updatedThread),
        ...buildStatusDatetimePayload(status, scheduledFor),
      }
    } else {
      const mediaItems = pendingMediaItems ?? post.media_items
      bodyPayload = {
        content: postBodyForPublish(content),
        ...buildStatusDatetimePayload(status, scheduledFor),
        media_items: mediaItems,
      }
    }

    const res = await fetch(`/api/posts/${post.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload),
    })
    if (res.ok) {
      const updated = await res.json() as Post
      onUpdate?.(updated)
      setStatus(updated.status as PostStatus)
      setScheduledFor(syncDatetimeFieldsFromSaved(updated))
      setBufferPostId(updated.buffer_post_id)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2500)
    } else {
      const d = await res.json().catch(() => ({}))
      setSaveError(typeof d.error === 'string' ? d.error : 'Failed to save')
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!post || !confirm('Delete this post? This cannot be undone.')) return
    await fetch(`/api/posts/${post.id}`, { method: 'DELETE' })
    onDelete?.(post.id)
    onOpenChange(false)
  }

  async function handleCopy() {
    const text = isThread ? threadTweets.join('\n\n---\n\n') : content
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleApprove() {
    if (!post) return
    setApproveState('sending')
    setApproveError('')
    if (!isThread && content !== post.content) await handleSave()
    const res = await fetch(`/api/posts/${post.id}/approve`, { method: 'POST' })
    if (res.ok) {
      const updated = await res.json() as Post
      onUpdate?.(updated)
      setStatus(updated.status as PostStatus)
      setScheduledFor(toDatetimeLocal(updated.scheduled_for))
      setBufferPostId(updated.buffer_post_id)
      setApproveState('done')
    } else {
      const d = await res.json().catch(() => ({}))
      setApproveError(typeof d.error === 'string' ? d.error : 'Failed to approve')
      setApproveState('error')
    }
  }

  async function handleMediaAccept(result: MediaResult) {
    if (!post) return
    const item = mediaItemFromResult(result)

    if (isThread) {
      setTweetMedia(prev => ({ ...prev, [focusedTweetIdx]: item }))
      const updatedThread = rawParsedThread.map((t, i) => {
        const { media: _omit, ...base } = t
        const updated = { ...base, text: threadTweets[i] ?? t.text }
        if (i === focusedTweetIdx) return { ...updated, media: item }
        const existing = tweetMedia[i]
        return existing ? { ...updated, media: existing } : updated
      })
      const res = await fetch(`/api/posts/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content_variants: { thread: updatedThread },
          media_items: threadMediaToPostItems(updatedThread),
        }),
      })
      if (res.ok) onUpdate?.(await res.json() as Post)
    } else {
      const newItems: Post['media_items'] = [item]
      setPendingMediaUrl(result.url)
      setPendingMediaItems(newItems)
      const res = await fetch(`/api/posts/${post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_items: newItems }),
      })
      if (res.ok) {
        onUpdate?.(await res.json() as Post)
      } else {
        setSaveError('Media saved locally but failed to persist — save the post to keep it')
      }
    }
  }

  async function removeTweetMedia(index: number) {
    if (!post) return
    setTweetMedia(prev => {
      const next = { ...prev }
      delete next[index]
      return next
    })
    // Persist removal: rebuild thread without this tweet's media
    const updatedThread = rawParsedThread.map((t, i) => {
      const { media: _omit, ...base } = t
      const updated = { ...base, text: threadTweets[i] ?? t.text }
      if (i === index) return updated
      const existing = tweetMedia[i]
      return existing ? { ...updated, media: existing } : updated
    })
    const res = await fetch(`/api/posts/${post.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content_variants: { thread: updatedThread },
        media_items: threadMediaToPostItems(updatedThread),
      }),
    })
    if (res.ok) onUpdate?.(await res.json() as Post)
  }

  if (!post) return null

  const channel = post.channel as Channel
  const activeMediaItems = pendingMediaItems ?? post.media_items
  const previewMediaUrl = pendingMediaUrl ?? activeMediaItems?.[0]?.url
  const previewMediaAlt = activeMediaItems?.[0]?.alt_text
  const hasMedia = isThread
    ? Object.keys(tweetMedia).length > 0
    : !!activeMediaItems.length

  const tweetLabel = (i: number) =>
    i === 0 ? 'Hook' : i === threadTweets.length - 1 ? 'Close' : `Tweet ${i + 1}`

  const previewTweets = threadTweets.map((text, i) => ({
    text,
    mediaUrl: tweetMedia[i]?.url,
    mediaAlt: tweetMedia[i]?.alt_text ?? undefined,
  }))

  const mediaSuggestedPrompt = isThread
    ? (rawParsedThread[focusedTweetIdx]?.imagePrompt ?? undefined)
    : (typeof post.generation_params?.imagePrompt === 'string'
        ? post.generation_params.imagePrompt
        : undefined)

  const mediaPostContent = isThread ? (threadTweets[focusedTweetIdx] ?? '') : content

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 overflow-hidden flex flex-col h-[88vh]">
        <DialogTitle className="sr-only">Edit {channel} post</DialogTitle>
        <DialogDescription className="sr-only">
          Edit post content, preview, and media before publishing.
        </DialogDescription>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-zinc-800 flex-shrink-0 pr-12">
          <Badge variant={channel}>{channel}</Badge>
          <span className="text-xs text-zinc-500">
            {format(new Date(post.created_at), 'MMM d, yyyy')}
          </span>
          {isThread && (
            <span className="text-xs text-zinc-500">· {threadTweets.length} tweets</span>
          )}
          {post.scheduled_for && (
            <span className="text-xs text-yellow-500 flex items-center gap-1">
              <CalendarClock className="w-3 h-3" />
              {format(new Date(post.scheduled_for), 'MMM d · h:mm a')}
            </span>
          )}
        </div>

        {/* Main body — split layout */}
        <div className="flex flex-1 overflow-hidden min-h-0">

          {/* ── Left: Editor ──────────────────────────────────────────── */}
          <div className="w-1/2 flex flex-col border-r border-zinc-800 overflow-y-auto">
            <div className="p-5 space-y-4">

              {/* Status & scheduling */}
              <div className="space-y-3 pb-4 border-b border-zinc-800">
                <div className="space-y-2">
                  <p className="text-[10px] text-zinc-600 uppercase tracking-widest">Status</p>
                  <div className="flex gap-2">
                    {STATUSES.map(s => (
                      <button
                        key={s}
                        onClick={() => {
                          const next = onStatusSelect(s, scheduledFor)
                          setStatus(next.status)
                          setScheduledFor(next.datetime)
                        }}
                        className={cn(
                          'flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors',
                          status === s ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] text-zinc-600 uppercase tracking-widest flex items-center gap-1.5">
                    <CalendarClock className="w-3.5 h-3.5" />
                    {datetimeFieldLabel(status)}
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduledFor}
                    onChange={e => setScheduledFor(onDatetimeChange(e.target.value))}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500/60 [color-scheme:dark]"
                  />
                  {status === 'published' && (
                    <p className="text-xs text-zinc-500">
                      Backdating is fine — pick when this actually went live, then save.
                    </p>
                  )}
                  {scheduledFor && status !== 'published' && (
                    <button
                      onClick={() => { setScheduledFor(''); setStatus('draft') }}
                      className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
                    >
                      Clear schedule
                    </button>
                  )}
                </div>

                {SOCIAL_CHANNELS.includes(channel) && status !== 'published' && (
                  <SendToBufferButton
                    postId={post.id}
                    channel={channel}
                    scheduledFor={post.scheduled_for ?? (scheduledFor ? new Date(scheduledFor).toISOString() : null)}
                    bufferPostId={bufferPostId ?? post.buffer_post_id}
                    onSuccess={p => {
                      setBufferPostId(p.buffer_post_id ?? null)
                      onUpdate?.({
                        ...post,
                        buffer_post_id: p.buffer_post_id ?? null,
                        scheduled_for: p.scheduled_for ?? post.scheduled_for,
                        status: post.status === 'draft' ? 'scheduled' : post.status,
                      })
                    }}
                  />
                )}
              </div>

              {/* Content editor */}
              {isThread ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-zinc-600 uppercase tracking-widest">Thread Tweets</p>
                    <FormattingRibbon onFormat={applyFormattingToThread} />
                  </div>
                  <p className="text-[10px] text-zinc-600">
                    Click a tweet to select it, then use the media panel below to add an image.
                  </p>
                  <div className="space-y-2">
                    {threadTweets.map((text, i) => {
                      const attached = tweetMedia[i]
                      const imageHint = rawParsedThread[i]?.imagePrompt
                      const over = text.length > 280
                      const isFocused = focusedTweetIdx === i
                      return (
                        <div
                          key={i}
                          className={cn(
                            'rounded-lg border p-3 space-y-2 transition-all cursor-pointer',
                            isFocused
                              ? 'border-violet-500/60 bg-zinc-800/40'
                              : 'border-zinc-800 bg-zinc-800/10 hover:border-zinc-700',
                          )}
                          onClick={() => setFocusedTweetIdx(i)}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">
                              {tweetLabel(i)}
                              {attached && (
                                <span className="ml-2 normal-case text-violet-400/80 font-normal">· image</span>
                              )}
                            </span>
                            <div className="flex items-center gap-2">
                              {isFocused && (
                                <span className="text-[10px] text-violet-400 font-medium">selected</span>
                              )}
                              <span className={cn('text-[11px] tabular-nums', over ? 'text-red-400 font-medium' : 'text-zinc-600')}>
                                {text.length}/280
                              </span>
                            </div>
                          </div>
                          <textarea
                            ref={el => { threadTextareaRefs.current[i] = el }}
                            value={text}
                            onChange={e => setThreadTweets(prev => { const a = [...prev]; a[i] = e.target.value; return a })}
                            onFocus={() => setFocusedTweetIdx(i)}
                            onClick={e => e.stopPropagation()}
                            rows={3}
                            className="w-full bg-transparent text-sm text-zinc-200 leading-relaxed resize-none focus:outline-none placeholder:text-zinc-600"
                          />
                          {attached && (
                            <div className="rounded overflow-hidden border border-zinc-700 flex items-center gap-2 px-2 py-1.5 bg-zinc-800/60">
                              <ImageIcon className="w-3 h-3 text-violet-400 shrink-0" />
                              <span className="text-[10px] text-zinc-400 flex-1 truncate">{attached.alt_text || 'Image attached'}</span>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={attached.url} alt="" className="w-8 h-8 object-cover rounded shrink-0" />
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); void removeTweetMedia(i) }}
                                className="p-0.5 text-zinc-600 hover:text-red-400 transition-colors shrink-0"
                                title="Remove image"
                              >
                                <XIcon className="w-3 h-3" />
                              </button>
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
                </div>
              ) : (
                <div className="space-y-2">
                  <FormattingRibbon onFormat={applyFormattingToSingle} />
                  <textarea
                    ref={textareaRef}
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    rows={12}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-violet-500/60"
                  />
                  {channel === 'x' && (
                    <p className={cn('text-xs text-right', content.length > 280 ? 'text-red-400' : 'text-zinc-600')}>
                      {content.length}/280
                    </p>
                  )}
                  {/* Quality score */}
                  {!isThread && content.length >= 60 && (
                    <div className="space-y-1.5 min-h-[20px]">
                      {scoreLoading ? (
                        <span className="text-[11px] text-zinc-600">Scoring…</span>
                      ) : postScore !== null ? (
                        <>
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              'text-[11px] font-semibold tabular-nums',
                              postScore >= 80 ? 'text-green-400' : postScore >= 65 ? 'text-yellow-400' : 'text-red-400'
                            )}>
                              {postScore}/100
                            </span>
                            <span className="text-[10px] text-zinc-600">quality score</span>
                          </div>
                          {fixError && <p className="text-[11px] text-red-400">{fixError}</p>}
                          {scoreIssues.map((issue, i) => (
                            <div key={i} className="flex items-center gap-2 bg-zinc-800/60 rounded-lg px-2 py-1">
                              <span className="text-[11px] text-zinc-500 flex-1 truncate" title={issue}>
                                {issue}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleFixIssue(issue)}
                                disabled={fixingIssue !== null || scoreLoading}
                                className="shrink-0 flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-violet-600/20 text-violet-300 hover:bg-violet-600/30 disabled:opacity-40 transition-colors"
                              >
                                {fixingIssue === issue ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                                Fix
                              </button>
                            </div>
                          ))}
                        </>
                      ) : null}
                    </div>
                  )}
                  {previewMediaAlt && <AltTextBox value={previewMediaAlt} label="Image alt text" />}
                </div>
              )}
            </div>
          </div>

          {/* ── Right: Preview ────────────────────────────────────────── */}
          <div className="w-1/2 flex flex-col overflow-y-auto">
            <div className="p-5">
              <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-3">Preview</p>
              {isThread ? (
                <XThreadPreview
                  tweets={previewTweets}
                  activeTweetIndex={focusedTweetIdx}
                />
              ) : (
                <ChannelPreview
                  channel={channel}
                  content={content}
                  mediaUrl={previewMediaUrl}
                  mediaAlt={previewMediaAlt}
                />
              )}
            </div>
          </div>
        </div>

        {/* ── Media section ─────────────────────────────────────────────── */}
        <div className="border-t border-zinc-800 flex-shrink-0">
          <button
            type="button"
            onClick={() => setShowMedia(!showMedia)}
            className="w-full flex items-center justify-between px-5 py-3 text-sm text-zinc-400 hover:text-white transition-colors"
          >
            <span className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4" />
              {isThread
                ? `Add image to ${tweetLabel(focusedTweetIdx)}`
                : 'Media'}
              {hasMedia && <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />}
            </span>
            {showMedia ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showMedia && (
            <div className="px-5 pb-5 max-h-[360px] overflow-y-auto border-t border-zinc-800/60">
              <MediaPanel
                postContent={mediaPostContent}
                companyId={companyId}
                channel={channel}
                postId={post.id}
                brandColors={brandColors}
                suggestedPrompt={mediaSuggestedPrompt}
                onAccept={handleMediaAccept}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-zinc-800 flex flex-col gap-2 flex-shrink-0">
          {saveSuccess && <p className="text-xs text-green-400">Saved successfully.</p>}
          {saveError && <p className="text-xs text-red-400">{saveError}</p>}
          {approveError && <p className="text-xs text-red-400">{approveError}</p>}
          <div className="flex items-center gap-2">
            <Button onClick={handleSave} disabled={saving} className="flex-1">
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
            {SOCIAL_CHANNELS.includes(channel) && status === 'draft' && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleApprove}
                disabled={approveState === 'sending' || approveState === 'done'}
                title="Approve — add to next available schedule slot"
                className={cn(approveState === 'done' && 'text-green-400')}
              >
                {approveState === 'done'
                  ? <Check className="w-3.5 h-3.5" />
                  : <CheckCircle2 className="w-3.5 h-3.5" />}
                {approveState === 'sending' ? 'Scheduling…' : approveState === 'done' ? 'Scheduled!' : 'Approve'}
              </Button>
            )}
            <Button variant="secondary" size="icon" onClick={handleCopy} title="Copy">
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </Button>
            <Button variant="destructive" size="icon" onClick={handleDelete} title="Delete">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
