'use client'

import { useState } from 'react'
import { Copy, Check, Save, RefreshCw, Image as ImageIcon } from 'lucide-react'
import { LinkedInIcon, XIcon, RedditIcon, FacebookIcon } from '@/components/ui/channel-icons'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Channel } from '@/types/database'

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
  onReset: () => void
  generationParams: Record<string, unknown>
  acceptedMedia?: AcceptedMedia | null
}

export function PostPreview({
  channel, content, imagePrompt, isStreaming, companyId, onReset, generationParams, acceptedMedia,
}: PostPreviewProps) {
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [editedContent, setEditedContent] = useState<string | null>(null)

  const displayContent = editedContent ?? content
  const meta = channel ? CHANNEL_META[channel] : null

  // Strip image prompt from displayed content
  const cleanContent = displayContent.includes('\n--\nIMAGE_PROMPT:')
    ? displayContent.split('\n--\nIMAGE_PROMPT:')[0].trim()
    : displayContent

  async function handleCopy() {
    await navigator.clipboard.writeText(cleanContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleSave() {
    if (!channel || !cleanContent) return
    setSaving(true)

    const mediaItems = acceptedMedia
      ? [{ type: acceptedMedia.type, url: acceptedMedia.url, storage_path: acceptedMedia.storagePath }]
      : undefined

    await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: companyId,
        channel,
        content: cleanContent,
        status: 'draft',
        generation_params: generationParams,
        ...(mediaItems ? { media_items: mediaItems } : {}),
      }),
    })

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

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
    <div className={cn('border rounded-xl overflow-hidden', meta?.accentClass ?? 'border-zinc-700')}>
      {/* Header */}
      <div className={cn('px-4 py-3 flex items-center justify-between', meta?.headerClass ?? 'border-b border-zinc-700')}>
        <div className="flex items-center gap-2">
          {meta && (
            <span className="text-zinc-400">{meta.icon}</span>
          )}
          {channel && (
            <Badge variant={channel}>{meta?.label}</Badge>
          )}
          {isStreaming && (
            <span className="flex items-center gap-1 text-xs text-violet-400">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
              Writing...
            </span>
          )}
        </div>

        {!isStreaming && cleanContent && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onReset}>
              <RefreshCw className="w-3.5 h-3.5" />
              New
            </Button>
            <Button variant="ghost" size="sm" onClick={handleCopy}>
              {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied!' : 'Copy'}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : saved ? 'Saved!' : 'Save draft'}
            </Button>
          </div>
        )}
      </div>

      {/* Content — editable after streaming completes */}
      <div className="p-5">
        {isStreaming ? (
          <pre className="whitespace-pre-wrap font-sans text-sm text-zinc-200 leading-relaxed">
            {cleanContent}
            <span className="inline-block w-0.5 h-4 bg-violet-400 animate-pulse ml-0.5 align-middle" />
          </pre>
        ) : (
          <textarea
            value={cleanContent}
            onChange={e => setEditedContent(e.target.value)}
            className="w-full bg-transparent text-sm text-zinc-200 leading-relaxed resize-none focus:outline-none"
            rows={Math.max(8, cleanContent.split('\n').length + 2)}
          />
        )}
      </div>

      {/* Accepted media preview */}
      {!isStreaming && acceptedMedia && (
        <div className="px-5 pb-4 pt-0">
          <div className="rounded-lg overflow-hidden border border-zinc-700">
            <div className="px-3 py-1.5 bg-zinc-800 flex items-center gap-1.5">
              <ImageIcon className="w-3 h-3 text-violet-400" />
              <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-wide">
                {acceptedMedia.type === 'image' ? 'AI Image' : 'Infographic'} attached
              </span>
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

      {/* Image prompt hint */}
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
    </div>
  )
}
