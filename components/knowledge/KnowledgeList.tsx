'use client'

import { useState, useCallback } from 'react'
import { Globe, FileText, Trash2, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface Chunk {
  id: string
  title: string | null
  source_url: string | null
  source_type: string
  content: string
  created_at: string
}

interface KnowledgeListProps {
  initialChunks: Chunk[]
  initialTotal: number
  companyId: string
}

export function KnowledgeList({ initialChunks, initialTotal, companyId }: KnowledgeListProps) {
  const [chunks, setChunks] = useState<Chunk[]>(initialChunks)
  const [total, setTotal] = useState(initialTotal)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    const res = await fetch(`/api/knowledge?companyId=${companyId}`)
    const data = await res.json()
    setChunks(data.chunks ?? [])
    setTotal(data.total ?? 0)
    setRefreshing(false)
  }, [companyId])

  async function handleDelete(id: string) {
    setDeletingId(id)
    await fetch(`/api/knowledge?id=${id}`, { method: 'DELETE' })
    setChunks(prev => prev.filter(c => c.id !== id))
    setTotal(prev => prev - 1)
    setDeletingId(null)
  }

  // Group chunks by source for cleaner display
  const bySource = chunks.reduce<Record<string, Chunk[]>>((acc, chunk) => {
    const key = chunk.source_url || '__manual__'
    if (!acc[key]) acc[key] = []
    acc[key].push(chunk)
    return acc
  }, {})

  if (chunks.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500 text-sm">
        No knowledge entries yet. Scrape your website or add entries manually above.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">
          <span className="text-white font-medium">{total}</span> chunks across{' '}
          <span className="text-white font-medium">{Object.keys(bySource).length}</span> sources
        </p>
        <Button variant="ghost" size="sm" onClick={refresh} disabled={refreshing}>
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="space-y-2">
        {Object.entries(bySource).map(([sourceKey, sourceChunks]) => {
          const isManual = sourceKey === '__manual__'
          const label = isManual
            ? 'Manual entries'
            : sourceKey.replace(/^https?:\/\//, '').replace(/\/$/, '')

          return (
            <div key={sourceKey} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 flex items-center gap-3 border-b border-zinc-800">
                {isManual
                  ? <FileText className="w-4 h-4 text-violet-400 flex-shrink-0" />
                  : <Globe className="w-4 h-4 text-blue-400 flex-shrink-0" />
                }
                <span className="text-sm font-medium text-white truncate flex-1">{label}</span>
                <Badge variant="default" className="flex-shrink-0">
                  {sourceChunks.length} chunk{sourceChunks.length !== 1 ? 's' : ''}
                </Badge>
              </div>

              <div className="divide-y divide-zinc-800/50">
                {sourceChunks.map(chunk => {
                  const isExpanded = expandedId === chunk.id
                  return (
                    <div key={chunk.id} className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          {chunk.title && (
                            <p className="text-xs font-medium text-zinc-300 mb-1 truncate">{chunk.title}</p>
                          )}
                          <p className={`text-xs text-zinc-500 leading-relaxed ${isExpanded ? '' : 'line-clamp-2'}`}>
                            {chunk.content}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : chunk.id)}
                            className="p-1.5 rounded text-zinc-600 hover:text-zinc-300 transition-colors"
                          >
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => handleDelete(chunk.id)}
                            disabled={deletingId === chunk.id}
                            className="p-1.5 rounded text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
