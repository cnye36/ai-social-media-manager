'use client'

import { useState, useRef } from 'react'
import { Copy, Check, Save, RefreshCw, Image as ImageIcon, Bold, Italic, List, Send } from 'lucide-react'
import { LinkedInIcon, XIcon, RedditIcon, FacebookIcon } from '@/components/ui/channel-icons'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MediaPanel } from './MediaPanel'
import { cn } from '@/lib/utils'
import type { Channel } from '@/types/database'

const BUFFER_CHANNELS: Channel[] = ['linkedin', 'x', 'facebook']

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

interface AcceptedMedia {
  type: 'image' | 'infographic'
  url: string
  storagePath: string
  svg?: string
}

interface PostPreviewProps {
  channel: Channel | null
  content: string
  imagePrompt?: string
  isStreaming: boolean
  companyId: string
  brandColors?: { primary?: string; accent?: string }
  onReset: () => void
  generationParams: Record<string, unknown>
}

export function PostPreview({
  channel, content, imagePrompt, isStreaming, companyId, brandColors, onReset, generationParams,
}: PostPreviewProps) {
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [editedContent, setEditedContent] = useState<string | null>(null)
  const [savedPostId, setSavedPostId] = useState<string | null>(null)
  const [showMedia, setShowMedia] = useState(false)
  const [acceptedMedia, setAcceptedMedia] = useState<AcceptedMedia | null>(null)
  const [bufferState, setBufferState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [bufferError, setBufferError] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const displayContent = editedContent ?? content
  const meta = channel ? CHANNEL_META[channel] : null

  const cleanContent = displayContent.includes('\n--\nIMAGE_PROMPT:')
    ? displayContent.split('\n--\nIMAGE_PROMPT:')[0].trim()
    : displayContent

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
    return [{ type: acceptedMedia.type, url: acceptedMedia.url, storage_path: acceptedMedia.storagePath, svg: acceptedMedia.svg ?? null }]
  }

  async function handleSave() {
    if (!channel || !cleanContent) return
    setSaving(true)
    setSaveError('')

    // If already saved once, PATCH the existing post instead of creating a duplicate
    if (savedPostId) {
      const res = await fetch(`/api/posts/${savedPostId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: cleanContent, media_items: buildMediaItems() }),
      })
      setSaving(false)
      if (!res.ok) { setSaveError('Failed to update post'); return }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      return
    }

    const res = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: companyId,
        channel,
        content: cleanContent,
        status: 'draft',
        generation_params: generationParams,
        media_items: buildMediaItems(),
      }),
    })

    setSaving(false)
    if (!res.ok) { setSaveError('Failed to save post'); return }
    const created = await res.json() as { id: string }
    setSavedPostId(created.id)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  async function handleSendToBuffer() {
    if (!savedPostId) return
    setBufferState('sending')
    setBufferError('')
    const res = await fetch('/api/buffer/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId: savedPostId }),
    })
    if (res.ok) {
      setBufferState('sent')
    } else {
      const d = await res.json().catch(() => ({}))
      setBufferError(typeof d.error === 'string' ? d.error : 'Failed to send to Buffer')
      setBufferState('error')
    }
  }

  // When media is accepted after a post has already been saved, immediately persist it
  async function handleMediaAccept(media: AcceptedMedia) {
    setAcceptedMedia(media)
    if (savedPostId) {
      await fetch(`/api/posts/${savedPostId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_items: [{ type: media.type, url: media.url, storage_path: media.storagePath, svg: media.svg ?? null }],
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowMedia(v => !v)}
                className={cn(showMedia || acceptedMedia
                  ? 'text-violet-300 bg-violet-600/10 hover:bg-violet-600/20'
                  : ''
                )}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                {acceptedMedia ? (acceptedMedia.type === 'image' ? 'Image ✓' : 'Infographic ✓') : 'Add media'}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleCopy}>
                {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied!' : 'Copy'}
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Saving...' : saved ? 'Saved!' : savedPostId ? 'Update draft' : 'Save draft'}
              </Button>
              {savedPostId && channel && BUFFER_CHANNELS.includes(channel) && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleSendToBuffer}
                  disabled={bufferState === 'sending' || bufferState === 'sent'}
                  title="Send to Buffer queue"
                  className={cn(bufferState === 'sent' && 'text-green-400')}
                >
                  {bufferState === 'sent' ? <Check className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
                  {bufferState === 'sending' ? 'Sending…' : bufferState === 'sent' ? 'Queued!' : 'Buffer'}
                </Button>
              )}
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
                    {acceptedMedia.type === 'image' ? 'AI Image' : 'Infographic'} attached
                  </span>
                </div>
                <button
                  onClick={() => setAcceptedMedia(null)}
                  className="text-[10px] text-zinc-600 hover:text-red-400 transition-colors"
                >
                  Remove
                </button>
              </div>
              {acceptedMedia.type === 'infographic' && acceptedMedia.svg ? (
                <div dangerouslySetInnerHTML={{ __html: acceptedMedia.svg }} className="w-full" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={acceptedMedia.url} alt="Attached media" className="w-full object-contain max-h-48" />
              )}
            </div>
          </div>
        )}

        {/* Image prompt hint — only when no media yet */}
        {!isStreaming && imagePrompt && !acceptedMedia && (
          <div className="px-5 pb-4 pt-0">
            <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3">
              <p className="text-xs text-zinc-500 font-medium mb-1 uppercase tracking-wide">Suggested image prompt</p>
              <p className="text-xs text-zinc-400 leading-relaxed">{imagePrompt}</p>
            </div>
          </div>
        )}

        {/* Character count for X */}
        {channel === 'x' && !isStreaming && cleanContent && !cleanContent.includes('---') && (
          <div className={cn('px-5 pb-3 text-right text-xs', cleanContent.length > 280 ? 'text-red-400' : 'text-zinc-500')}>
            {cleanContent.length}/280
          </div>
        )}

        {(saveError || bufferError) && (
          <div className="px-5 pb-3 space-y-1">
            {saveError && <p className="text-xs text-red-400">{saveError}</p>}
            {bufferError && <p className="text-xs text-red-400">{bufferError}</p>}
          </div>
        )}
      </div>

      {/* Media panel — shown below card when toggled */}
      {postReady && showMedia && channel && (
        <MediaPanel
          postContent={cleanContent}
          companyId={companyId}
          channel={channel}
          brandColors={brandColors}
          postId={savedPostId ?? undefined}
          onAccept={handleMediaAccept}
        />
      )}
    </div>
  )
}
