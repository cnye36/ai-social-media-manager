'use client'

import { useState } from 'react'
import {
  X, Copy, Check, Download, ExternalLink, Loader2,
  LayoutTemplate, RefreshCw, Link2,
} from 'lucide-react'
import { format } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { AltTextBox } from '@/components/media/AltTextBox'
import { HoverDownloadImage } from '@/components/media/HoverDownloadImage'
import { downloadMediaFile } from '@/lib/media/download'
import type { Channel } from '@/types/database'

export interface ModalMediaItem {
  id: string
  url: string
  prompt: string | null
  alt_text?: string | null
  type: 'image' | 'infographic'
  svg: string | null
  storage_path?: string
  post_id: string | null
  created_at: string
  posts?: {
    id: string
    channel: Channel
    content: string
  } | null
}

interface MediaDetailModalProps {
  item: ModalMediaItem
  companyId: string
  onClose: () => void
}

export function MediaDetailModal({ item, companyId, onClose }: MediaDetailModalProps) {
  const [copied, setCopied] = useState(false)
  const [currentUrl, setCurrentUrl] = useState(item.url)

  const [canvaLoading, setCanvaLoading] = useState(false)
  const [canvaUrl, setCanvaUrl] = useState<string | null>(null)
  const [canvaError, setCanvaError] = useState<string | null>(null)

  const [designPrompt, setDesignPrompt] = useState('')
  const [regenLoading, setRegenLoading] = useState(false)
  const [regenError, setRegenError] = useState<string | null>(null)

  async function copyUrl() {
    await navigator.clipboard.writeText(currentUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function download() {
    await downloadMediaFile(currentUrl, `media-${item.id}.png`)
  }

  async function openInCanva(imageUrl: string, title: string) {
    setCanvaLoading(true)
    setCanvaError(null)
    try {
      const res = await fetch('/api/canva/design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl, title }),
      })
      const data = await res.json() as { editUrl?: string; error?: string }
      if (!res.ok) {
        if (res.status === 400 && data.error?.includes('not connected')) {
          setCanvaError('Canva is not connected. Connect it in Settings first.')
        } else {
          setCanvaError(data.error ?? 'Failed to create Canva design')
        }
        return
      }
      const url = data.editUrl!
      setCanvaUrl(url)
      window.open(url, '_blank')
    } catch (err) {
      setCanvaError((err as Error).message)
    } finally {
      setCanvaLoading(false)
    }
  }

  async function regenerate() {
    setRegenLoading(true)
    setRegenError(null)
    try {
      const res = await fetch('/api/generate/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postContent: designPrompt,
          companyId,
          channel: item.posts?.channel ?? 'linkedin',
          refinementNote: designPrompt,
          postId: item.post_id ?? undefined,
        }),
      })
      const data = await res.json() as { url?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Image generation failed')

      setCurrentUrl(data.url ?? currentUrl)
      setCanvaUrl(null)
    } catch (err) {
      setRegenError((err as Error).message)
    } finally {
      setRegenLoading(false)
    }
  }

  const busy = canvaLoading || regenLoading

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        style={{ maxHeight: '92vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium px-2 py-0.5 rounded bg-blue-500/15 text-blue-300">
              AI Image
            </span>
            <span className="text-xs text-zinc-500">
              {format(new Date(item.created_at), 'MMM d, yyyy · h:mm a')}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-500 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden min-h-0">
          <div className="flex-1 flex items-center justify-center bg-zinc-900 overflow-auto p-6">
            <HoverDownloadImage
              src={currentUrl}
              alt={item.alt_text ?? item.prompt ?? 'Generated image'}
              className="max-w-full max-h-full object-contain rounded-xl shadow-xl"
              wrapperClassName="max-w-full max-h-full flex items-center justify-center"
              downloadFilename={`media-${item.id}.png`}
            />
          </div>

          <div className="w-72 shrink-0 border-l border-zinc-800 flex flex-col overflow-y-auto">
            <div className="p-4 border-b border-zinc-800 space-y-2">
              <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-3">Actions</p>

              <button
                onClick={copyUrl}
                className="w-full flex items-center gap-2.5 px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-lg text-sm transition-colors"
              >
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied!' : 'Copy URL'}
              </button>

              <button
                onClick={download}
                className="w-full flex items-center gap-2.5 px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-lg text-sm transition-colors"
              >
                <Download className="w-4 h-4" />
                Download
              </button>

              <div className="pt-1 space-y-2">
                {canvaUrl ? (
                  <a
                    href={canvaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center gap-2.5 px-3 py-2 bg-violet-900/40 hover:bg-violet-900/60 text-violet-300 rounded-lg text-sm transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Reopen in Canva
                  </a>
                ) : (
                  <button
                    onClick={() => openInCanva(currentUrl, item.prompt ?? 'Social Media Design')}
                    disabled={busy}
                    className="w-full flex items-center gap-2.5 px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-lg text-sm transition-colors disabled:opacity-40"
                  >
                    {canvaLoading
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <LayoutTemplate className="w-4 h-4" />
                    }
                    Edit in Canva
                  </button>
                )}

                {canvaError && (
                  <p className="text-xs text-red-400 px-1">
                    {canvaError}
                    {canvaError.includes('not connected') && (
                      <a
                        href={`/api/canva/connect?companyId=${companyId}`}
                        className="ml-1 underline text-violet-400"
                      >
                        Connect in Settings
                      </a>
                    )}
                  </p>
                )}
              </div>
            </div>

            <div className="p-4 border-b border-zinc-800 space-y-3">
              <div>
                <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Image assistant</p>
                <p className="text-xs text-zinc-600 mt-1 leading-relaxed">
                  Describe changes to regenerate with AI, or open in Canva to refine layout and text.
                </p>
              </div>

              <textarea
                value={designPrompt}
                onChange={e => setDesignPrompt(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && designPrompt.trim()) {
                    regenerate()
                  }
                }}
                placeholder="e.g. Dark background, bold white headline, infographic with 3 stat cards…"
                rows={4}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 resize-none"
              />

              {regenError && (
                <p className="text-xs text-red-400">{regenError}</p>
              )}

              <div className="flex gap-2">
                <button
                  onClick={regenerate}
                  disabled={busy || !designPrompt.trim()}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                >
                  {regenLoading
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Generating…</>
                    : <><RefreshCw className="w-3.5 h-3.5" />Regenerate</>
                  }
                </button>

                <button
                  onClick={() => openInCanva(currentUrl, designPrompt || item.prompt || 'Social Media Design')}
                  disabled={busy}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                >
                  {canvaLoading
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Opening…</>
                    : <><LayoutTemplate className="w-3.5 h-3.5" />Open in Canva</>
                  }
                </button>
              </div>

              <p className="text-[10px] text-zinc-700 text-center">⌘ Enter to regenerate</p>
            </div>

            <div className="p-4 space-y-4 text-xs">
              {(item.alt_text ?? item.prompt) && (
                <AltTextBox
                  value={item.alt_text ?? item.prompt?.slice(0, 125) ?? ''}
                  label="Alt text"
                />
              )}

              {item.prompt && (
                <div>
                  <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Original Prompt</p>
                  <p className="text-zinc-500 leading-relaxed line-clamp-6">{item.prompt}</p>
                </div>
              )}

              {item.posts && (
                <div>
                  <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Linked Post</p>
                  <Badge variant={item.posts.channel} className="text-[10px] mb-1.5">
                    {item.posts.channel}
                  </Badge>
                  <p className="text-zinc-600 line-clamp-3 leading-relaxed">
                    {item.posts.content.slice(0, 120)}…
                  </p>
                </div>
              )}

              <div>
                <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">URL</p>
                <a
                  href={currentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-600 hover:text-violet-400 break-all flex items-start gap-1 transition-colors"
                >
                  <Link2 className="w-3 h-3 shrink-0 mt-0.5" />
                  <span className="line-clamp-2">{currentUrl}</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
