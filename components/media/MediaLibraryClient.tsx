'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { ImageIcon, Maximize2, RefreshCw, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { MediaDetailModal } from '@/components/media/MediaDetailModal'
import type { ModalMediaItem } from '@/components/media/MediaDetailModal'
import type { Channel } from '@/types/database'

interface LibraryPost {
  id: string
  channel: Channel
  content: string
}

interface LibraryItem {
  id: string
  url: string
  prompt: string | null
  type: 'image' | 'infographic'
  svg: string | null
  post_id: string | null
  storage_path: string
  created_at: string
  posts: LibraryPost | null
}

function toModalItem(item: LibraryItem): ModalMediaItem {
  return {
    ...item,
    posts: item.posts ?? null,
  }
}

export function MediaLibraryClient({ companyId }: { companyId: string }) {
  const [items, setItems] = useState<LibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null)

  async function load() {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/media?companyId=${companyId}`)
      const data = await res.json() as { items: LibraryItem[]; error?: string }
      if (!res.ok) {
        setLoadError(data.error ?? `Error ${res.status}`)
      } else {
        setItems(data.items)
      }
    } catch (e) {
      setLoadError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [companyId])

  return (
    <>
      <div className="min-h-screen p-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-white">Media Library</h1>
              <p className="text-zinc-400 mt-1 text-sm">All generated images — click any to view, regenerate, or edit in Canva</p>
            </div>
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-zinc-400 hover:text-white transition-colors disabled:opacity-40"
            >
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-24 gap-3 text-zinc-500">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading library…</span>
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
              <p className="text-sm text-red-400">Failed to load media library</p>
              <p className="text-xs text-zinc-600 font-mono">{loadError}</p>
              <button onClick={load} className="text-xs text-violet-400 hover:text-violet-300 transition-colors">Try again</button>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-zinc-600">
              <ImageIcon className="w-12 h-12" />
              <p className="text-sm">No images yet. Generate media for a post to start building your library.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {items.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedItem(item)}
                  className="group text-left bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-violet-500/50 transition-all hover:shadow-lg hover:shadow-violet-900/10"
                >
                  {/* Thumbnail */}
                  <div className="relative aspect-video bg-zinc-950 flex items-center justify-center overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.url}
                      alt={item.prompt ?? 'Generated image'}
                      className="w-full h-full object-cover"
                    />

                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-zinc-900/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 backdrop-blur-sm text-white rounded-lg text-xs font-medium border border-white/10">
                        <Maximize2 className="w-3.5 h-3.5" />
                        View &amp; Edit
                      </div>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300">
                        AI Image
                      </span>
                      <span className="text-[10px] text-zinc-600">
                        {format(new Date(item.created_at), 'MMM d')}
                      </span>
                    </div>

                    {item.prompt && (
                      <p className="text-[11px] text-zinc-500 line-clamp-2 leading-relaxed">
                        {item.prompt}
                      </p>
                    )}

                    {item.posts && (
                      <div className="flex items-center gap-1.5 pt-1 border-t border-zinc-800">
                        <Badge variant={item.posts.channel as Channel} className="text-[10px]">
                          {item.posts.channel}
                        </Badge>
                        <span className="text-[10px] text-zinc-600 truncate">
                          {item.posts.content.slice(0, 40)}…
                        </span>
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedItem && (
        <MediaDetailModal
          item={toModalItem(selectedItem)}
          companyId={companyId}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </>
  )
}
