'use client'

import { useState, useRef } from 'react'
import { format } from 'date-fns'
import { Copy, Check, RefreshCw, Image as ImageIcon, Bold, Italic, List, Eye, Pencil, CalendarClock, CircleCheck } from 'lucide-react'
import { SendToBufferButton } from '@/components/posts/SendToBufferButton'
import { buildStatusDatetimePayload } from '@/lib/content-status'
import { LinkedInIcon, XIcon, RedditIcon, FacebookIcon } from '@/components/ui/channel-icons'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MediaPanel } from './MediaPanel'
import { ChannelPreview } from '@/components/posts/ChannelPreview'
import { cn } from '@/lib/utils'
import { HoverDownloadImage } from '@/components/media/HoverDownloadImage'
import { AltTextBox } from '@/components/media/AltTextBox'
import { mediaItemFromResult } from '@/types/media'
import { splitImagePromptFromText } from '@/lib/generate/image-prompt'
import type { Channel } from '@/types/database'
import type { MediaResult } from '@/types/media'

const CHANNEL_META: Record<Channel, { label: string; icon: React.ReactNode; accentClass: string; headerClass: string }> = {
  linkedin: {
    label: 'LinkedIn',
    icon: <LinkedInIcon className="w-4 h-4" />,
    accentClass: 'border-blue-500/30',
    headerClass: 'bg-blue-500/5 border-b border-blue-500/20',
  },
  x: {
    label: 'X (Twitter)',
    icon: <XIcon className="w-4 h-4" />,
    accentClass: 'border-zinc-500/30',
    headerClass: 'bg-zinc-500/5 border-b border-zinc-500/20',
  },
  reddit: {
    label: 'Reddit',
    icon: <RedditIcon className="w-4 h-4" />,
    accentClass: 'border-orange-500/30',
    headerClass: 'bg-orange-500/5 border-b border-orange-500/20',
  },
  facebook: {
    label: 'Facebook',
    icon: <FacebookIcon className="w-4 h-4" />,
    accentClass: 'border-blue-400/30',
    headerClass: 'bg-blue-400/5 border-b border-blue-400/20',
  },
}

type AcceptedMedia = MediaResult
type SaveState = 'idle' | 'saving' | 'draft' | 'scheduled' | 'published'

interface PostPreviewProps {
  channel: Channel | null
  content: string
  imagePrompt?: string
  isStreaming: boolean
  companyId: string
  brandColors?: { primary?: string; accent?: string }
  onReset: () => void
  generationParams: Record<string, unknown>
  onSaved?: () => void
}

export function PostPreview({
  channel, content, imagePrompt, isStreaming, companyId, brandColors, onReset, generationParams, onSaved,
}: PostPreviewProps) {
  const [copied, setCopied] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState('')
  const [editedContent, setEditedContent] = useState<string | null>(null)
  const [savedPostId, setSavedPostId] = useState<string | null>(null)
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduledFor, setScheduledFor] = useState('')
  const [acceptedMedia, setAcceptedMedia] = useState<AcceptedMedia | null>(null)
  const [savedScheduledFor, setSavedScheduledFor] = useState<string | null>(null)
  const [savedBufferPostId, setSavedBufferPostId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const displayContent = editedContent ?? content
  const meta = channel ? CHANNEL_META[channel] : null

  const parsedBody = splitImagePromptFromText(displayContent)
  const cleanContent = parsedBody.content
  const resolvedImagePrompt = imagePrompt ?? parsedBody.imagePrompt

  async function handleCopy() {
    await navigator.clipboard.writeText(cleanContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function applyFormatting(type: 'bold' | 'italic' | 'bullet') {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const val = ta.value
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

    setEditedContent(next)
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(ns, ne) })
  }

  function buildMediaItems() {
    if (!acceptedMedia) return []
    return [mediaItemFromResult(acceptedMedia)]
  }

  async function savePost(status: 'draft' | 'scheduled' | 'published', scheduleDatetime?: string) {
    if (!channel || !cleanContent) return
    setSaveState('saving')
    setSaveError('')

    const statusPayload = buildStatusDatetimePayload(
      status,
      status === 'scheduled' ? (scheduleDatetime ?? '') : '',
    )
    const body = {
      content: cleanContent,
      media_items: buildMediaItems(),
      generation_params: {
        ...generationParams,
        ...(resolvedImagePrompt ? { imagePrompt: resolvedImagePrompt } : {}),
      },
      ...statusPayload,
    }

    try {
      let saved: { id: string; scheduled_for?: string | null; buffer_post_id?: string | null }

      if (savedPostId) {
        const res = await fetch(`/api/posts/${savedPostId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error('Failed to update post')
        saved = await res.json() as typeof saved
      } else {
        const res = await fetch('/api/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            company_id: companyId,
            channel,
            ai_generated: true,
            ...body,
          }),
        })
        if (!res.ok) throw new Error('Failed to save post')
        saved = await res.json() as typeof saved
        setSavedPostId(saved.id)
      }

      setSavedScheduledFor(saved.scheduled_for ?? null)
      setSavedBufferPostId(saved.buffer_post_id ?? null)
      setSaveState(status === 'draft' ? 'draft' : status === 'scheduled' ? 'scheduled' : 'published')
      setShowSchedule(false)
      setScheduledFor('')
      onSaved?.()
    } catch {
      setSaveError(savedPostId ? 'Failed to update post' : 'Failed to save post')
      setSaveState('idle')
    }
  }

  // When media is accepted after a post has already been saved, immediately persist it
  async function handleMediaAccept(media: AcceptedMedia) {
    setAcceptedMedia(media)
    setViewMode('preview')  // jump to preview so user sees the result immediately
    if (savedPostId) {
      await fetch(`/api/posts/${savedPostId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_items: [mediaItemFromResult(media)],
        }),
      })
    }
  }

  const postReady = !isStreaming && !!cleanContent && !!channel

  if (!channel && !content) {
    return (
      <div className="flex flex-col items-center justify-center h-80 text-center border border-dashed border-zinc-700 rounded-xl">
        <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center mb-3">
          <ImageIcon className="w-6 h-6 text-zinc-600" />
        </div>
        <p className="text-zinc-500 text-sm">Your generated post will appear here</p>
        <p className="text-zinc-600 text-xs mt-1">Fill out the form and click Generate</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className={cn('border rounded-xl overflow-hidden', meta?.accentClass ?? 'border-zinc-700')}>
        {/* Header */}
        <div className={cn('px-4 py-3 flex items-center justify-between', meta?.headerClass ?? 'border-b border-zinc-700')}>
          <div className="flex items-center gap-2">
            {meta && <span className="text-zinc-400">{meta.icon}</span>}
            {channel && <Badge variant={channel}>{meta?.label}</Badge>}
            {isStreaming && (
              <span className="flex items-center gap-1 text-xs text-violet-400">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                Writing...
              </span>
            )}
          </div>

          {!isStreaming && cleanContent && (
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="sm" onClick={onReset}>
                <RefreshCw className="w-3.5 h-3.5" />
                New
              </Button>
              {/* Edit / Preview toggle */}
              <div className="flex items-center rounded-lg border border-zinc-700 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setViewMode('edit')}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 text-xs transition-colors',
                    viewMode === 'edit'
                      ? 'bg-zinc-700 text-white'
                      : 'text-zinc-500 hover:text-zinc-300'
                  )}
                >
                  <Pencil className="w-3 h-3" /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('preview')}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 text-xs transition-colors',
                    viewMode === 'preview'
                      ? 'bg-zinc-700 text-white'
                      : 'text-zinc-500 hover:text-zinc-300'
                  )}
                >
                  <Eye className="w-3 h-3" /> Preview
                </button>
              </div>
              <Button variant="ghost" size="sm" onClick={handleCopy}>
                {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied!' : 'Copy'}
              </Button>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-5 space-y-2">
          {isStreaming ? (
            <pre className="whitespace-pre-wrap font-sans text-sm text-zinc-200 leading-relaxed">
              {cleanContent}
              <span className="inline-block w-0.5 h-4 bg-violet-400 animate-pulse ml-0.5 align-middle" />
            </pre>
          ) : viewMode === 'preview' && channel ? (
            <ChannelPreview
              channel={channel}
              content={cleanContent}
              mediaUrl={acceptedMedia?.url}
              mediaAlt={acceptedMedia?.altText}
            />
          ) : (
            <>
              <div className="flex items-center gap-0.5 border border-zinc-800 rounded-lg p-1 w-fit">
                {([
                  { type: 'bold' as const, icon: <Bold className="w-3.5 h-3.5" />, title: 'Bold' },
                  { type: 'italic' as const, icon: <Italic className="w-3.5 h-3.5" />, title: 'Italic' },
                  { type: 'bullet' as const, icon: <List className="w-3.5 h-3.5" />, title: 'Bullet' },
                ]).map(({ type, icon, title }) => (
                  <button
                    key={type}
                    type="button"
                    onMouseDown={e => { e.preventDefault(); applyFormatting(type) }}
                    title={title}
                    className="p-1.5 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                  >
                    {icon}
                  </button>
                ))}
              </div>
              <textarea
                ref={textareaRef}
                value={cleanContent}
                onChange={e => setEditedContent(e.target.value)}
                className="w-full bg-transparent text-sm text-zinc-200 leading-relaxed resize-none focus:outline-none"
                rows={Math.max(8, cleanContent.split('\n').length + 2)}
              />
            </>
          )}
        </div>

        {/* Accepted media preview */}
        {!isStreaming && acceptedMedia && (
          <div className="px-5 pb-4 pt-0">
            <div className="rounded-lg overflow-hidden border border-zinc-700">
              <div className="px-3 py-1.5 bg-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <ImageIcon className="w-3 h-3 text-violet-400" />
                  <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-wide">
                    Image attached
                  </span>
                </div>
                <button
                  onClick={() => setAcceptedMedia(null)}
                  className="text-[10px] text-zinc-600 hover:text-red-400 transition-colors"
                >
                  Remove
                </button>
              </div>
              <HoverDownloadImage
                src={acceptedMedia.url}
                alt={acceptedMedia.altText}
                className="w-full object-contain max-h-48"
                wrapperClassName="w-full"
              />
            </div>
            <AltTextBox value={acceptedMedia.altText} className="mt-2" />
          </div>
        )}

        {/* Save / schedule / publish */}
        {postReady && (
          <div className="px-5 pb-4 pt-0 space-y-3 border-t border-zinc-800/80">
            {saveState === 'draft' ? (
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-sm text-green-400">
                  <Check className="w-4 h-4" /> Saved as draft
                </span>
                <button
                  type="button"
                  onClick={() => setSaveState('idle')}
                  className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
                >
                  Edit again
                </button>
              </div>
            ) : saveState === 'scheduled' ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex items-center gap-1.5 text-sm text-yellow-400">
                  <CalendarClock className="w-4 h-4" />
                  Scheduled
                  {savedScheduledFor && (
                    <span className="text-zinc-400">
                      · {format(new Date(savedScheduledFor), 'MMM d · h:mm a')}
                    </span>
                  )}
                </span>
                {savedPostId && channel && (
                  <SendToBufferButton
                    postId={savedPostId}
                    channel={channel}
                    scheduledFor={savedScheduledFor}
                    bufferPostId={savedBufferPostId}
                    onSuccess={p => {
                      setSavedBufferPostId(p.buffer_post_id ?? null)
                      if (p.scheduled_for) setSavedScheduledFor(p.scheduled_for)
                    }}
                  />
                )}
                <button
                  type="button"
                  onClick={() => setSaveState('idle')}
                  className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
                >
                  Edit again
                </button>
              </div>
            ) : saveState === 'published' ? (
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-sm text-emerald-400">
                  <CircleCheck className="w-4 h-4" /> Marked as published
                </span>
                <button
                  type="button"
                  onClick={() => setSaveState('idle')}
                  className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
                >
                  Edit again
                </button>
              </div>
            ) : saveState === 'saving' ? (
              <p className="text-sm text-zinc-500">Saving…</p>
            ) : showSchedule ? (
              <div className="space-y-2">
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
                  <Button size="sm" variant="ghost" onClick={() => { setShowSchedule(false); setScheduledFor('') }}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => savePost('draft')}>
                  Save as draft
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowSchedule(true)}>
                  <CalendarClock className="w-3.5 h-3.5" />
                  Schedule
                </Button>
                <Button size="sm" variant="outline" onClick={() => savePost('published')}>
                  <CircleCheck className="w-3.5 h-3.5" />
                  Mark published
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Character count for X */}
        {channel === 'x' && !isStreaming && cleanContent && !cleanContent.includes('---') && (
          <div className={cn('px-5 pb-3 text-right text-xs', cleanContent.length > 280 ? 'text-red-400' : 'text-zinc-500')}>
            {cleanContent.length}/280
          </div>
        )}

        {saveError && (
          <div className="px-5 pb-3">
            <p className="text-xs text-red-400">{saveError}</p>
          </div>
        )}
      </div>

      {postReady && channel && (
        <MediaPanel
          postContent={cleanContent}
          companyId={companyId}
          channel={channel}
          brandColors={brandColors}
          postId={savedPostId ?? undefined}
          suggestedPrompt={resolvedImagePrompt}
          onAccept={handleMediaAccept}
        />
      )}
    </div>
  )
}
