'use client'

import { useState, useRef, useEffect } from 'react'
import { format } from 'date-fns'
import { Bold, Italic, List, Copy, Check, Trash2, CalendarClock, Image as ImageIcon, CheckCircle2 } from 'lucide-react'
import { SendToBufferButton } from '@/components/posts/SendToBufferButton'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AltTextBox } from '@/components/media/AltTextBox'
import { MediaPanel } from '@/components/generate/MediaPanel'
import { mediaItemFromResult } from '@/types/media'
import { ChannelPreview } from '@/components/posts/ChannelPreview'
import { cn } from '@/lib/utils'
import type { Post, Channel, PostStatus } from '@/types/database'
import { postBodyForPublish } from '@/lib/generate/image-prompt'
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

// ─── Formatting ribbon ───────────────────────────────────────────────────────

function FormattingRibbon({ onFormat }: { onFormat: (type: 'bold' | 'italic' | 'bullet') => void }) {
  return (
    <div className="flex items-center gap-0.5 border border-zinc-800 rounded-lg p-1 w-fit">
      {([
        { type: 'bold' as const, icon: <Bold className="w-3.5 h-3.5" />, title: 'Bold (**text**)' },
        { type: 'italic' as const, icon: <Italic className="w-3.5 h-3.5" />, title: 'Italic (_text_)' },
        { type: 'bullet' as const, icon: <List className="w-3.5 h-3.5" />, title: 'Bullet point' },
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

// ─── Modal ───────────────────────────────────────────────────────────────────

interface PostEditorModalProps {
  post: Post | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate?: (post: Post) => void
  onDelete?: (id: string) => void
  companyId: string
  brandColors?: { primary?: string; accent?: string }
}

type ModalTab = 'post' | 'media'
const STATUSES: PostStatus[] = ['draft', 'scheduled', 'published', 'archived']

export function PostEditorModal({
  post, open, onOpenChange, onUpdate, onDelete, companyId, brandColors,
}: PostEditorModalProps) {
  const [tab, setTab] = useState<ModalTab>('post')
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
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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
      setTab('post')
    }
  }, [post?.id, open])

  function applyFormatting(type: 'bold' | 'italic' | 'bullet') {
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

  async function handleSave() {
    if (!post) return
    setSaving(true); setSaveError('')
    const mediaItems = pendingMediaItems ?? post.media_items
    const statusPayload = buildStatusDatetimePayload(status, scheduledFor)
    const res = await fetch(`/api/posts/${post.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: postBodyForPublish(content),
        ...statusPayload,
        media_items: mediaItems,
      }),
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
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleApprove() {
    if (!post) return
    setApproveState('sending')
    setApproveError('')
    // Save any pending content changes first
    if (content !== post.content) await handleSave()
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

  if (!post) return null

  const channel = post.channel as Channel
  const activeMediaItems = pendingMediaItems ?? post.media_items
  const existingMediaUrl = activeMediaItems?.[0]?.url
  const previewMediaUrl = pendingMediaUrl ?? existingMediaUrl
  const previewMediaAlt = activeMediaItems?.[0]?.alt_text
  const hasMedia = !!activeMediaItems.length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden flex flex-col max-h-[90vh]">
        <DialogTitle className="sr-only">Edit {channel} post</DialogTitle>
        <DialogDescription className="sr-only">
          Edit post content, preview, and media before publishing.
        </DialogDescription>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-800 flex-shrink-0 pr-12">
          <Badge variant={channel}>{channel}</Badge>
          <span className="text-xs text-zinc-500">
            {format(new Date(post.created_at), 'MMM d, yyyy')}
          </span>
          {post.scheduled_for && (
            <span className="text-xs text-yellow-500 flex items-center gap-1">
              <CalendarClock className="w-3 h-3" />
              {format(new Date(post.scheduled_for), 'MMM d · h:mm a')}
            </span>
          )}
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-zinc-800 flex-shrink-0 px-5">
          {(['post', 'media'] as ModalTab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'py-2.5 px-1 mr-6 text-sm font-medium border-b-2 -mb-px transition-colors capitalize flex items-center gap-1.5',
                tab === t ? 'border-violet-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'
              )}
            >
              {t === 'media' ? (
                <>
                  <ImageIcon className="w-3.5 h-3.5" />
                  Media
                  {hasMedia && <span className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />}
                </>
              ) : 'Post'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'post' ? (
            <div className="p-5 space-y-4">
              {/* Live preview */}
              <div>
                <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-2">Preview</p>
                <ChannelPreview channel={channel} content={content} mediaUrl={previewMediaUrl} mediaAlt={previewMediaAlt} />
              </div>

              {previewMediaAlt && (
                <AltTextBox value={previewMediaAlt} label="Image alt text" />
              )}

              {/* Editor */}
              <div className="space-y-2">
                <FormattingRibbon onFormat={applyFormatting} />
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  rows={10}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-violet-500/60"
                />
                {channel === 'x' && (
                  <p className={cn('text-xs text-right', content.length > 280 ? 'text-red-400' : 'text-zinc-600')}>
                    {content.length}/280
                  </p>
                )}
              </div>

              {/* Status */}
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

              {/* Schedule */}
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
          ) : (
            <div className="p-5">
              <MediaPanel
                postContent={content}
                companyId={companyId}
                channel={channel}
                postId={post.id}
                brandColors={brandColors}
                suggestedPrompt={
                  typeof post.generation_params?.imagePrompt === 'string'
                    ? post.generation_params.imagePrompt
                    : undefined
                }
                onAccept={async r => {
                  const newItems: Post['media_items'] = [mediaItemFromResult(r)]
                  setPendingMediaUrl(r.url)
                  setPendingMediaItems(newItems)
                  // Switch to Post tab immediately so the user sees the media attached
                  setTab('post')
                  const res = await fetch(`/api/posts/${post.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ media_items: newItems }),
                  })
                  if (res.ok) {
                    const updated = await res.json() as Post
                    onUpdate?.(updated)
                  } else {
                    setSaveError('Media saved locally but failed to persist — save the post to keep it')
                  }
                }}
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
