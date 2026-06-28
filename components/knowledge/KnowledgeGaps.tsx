'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Search, TrendingUp } from 'lucide-react'

interface Gap {
  query: string
  count: number
  miss: boolean
}

export function KnowledgeGaps({ companyId }: { companyId: string }) {
  const [gaps, setGaps] = useState<Gap[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch(`/api/knowledge/gaps?companyId=${companyId}`)
      .then(r => r.json())
      .then((d: { gaps?: Gap[] }) => setGaps(d.gaps ?? []))
      .catch(() => undefined)
      .finally(() => setLoaded(true))
  }, [companyId])

  if (!loaded || gaps.length === 0) return null

  return (
    <div className="bg-zinc-900 border border-amber-500/20 rounded-xl p-6">
      <div className="flex items-start gap-2 mb-4">
        <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
        <div>
          <h2 className="font-semibold text-white leading-none">Knowledge Gaps</h2>
          <p className="text-xs text-zinc-500 mt-1">
            Topics your AI searched for but couldn&apos;t find in the last 30 days
          </p>
        </div>
      </div>

      <div className="space-y-1">
        {gaps.map(gap => (
          <div
            key={gap.query}
            className="flex items-center gap-3 py-2 border-b border-zinc-800/60 last:border-0"
          >
            <Search className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
            <span className="text-sm text-zinc-300 flex-1 truncate">&ldquo;{gap.query}&rdquo;</span>
            <div className="flex items-center gap-2 shrink-0">
              {gap.miss && (
                <span className="text-[10px] text-red-400 uppercase tracking-wider font-medium">
                  No results
                </span>
              )}
              <span className="text-xs text-zinc-500 flex items-center gap-1 tabular-nums">
                <TrendingUp className="w-3 h-3" />
                {gap.count}×
              </span>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-zinc-600 mt-4">
        Add knowledge entries or scrape pages covering these topics to improve content quality.
      </p>
    </div>
  )
}
