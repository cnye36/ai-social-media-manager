'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Check, ExternalLink, Link2Off, Loader2, X } from 'lucide-react'

interface RedditConnectProps {
  companyId: string
  compact?: boolean
}

export function RedditConnect({ companyId, compact }: RedditConnectProps) {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<{ connected: boolean; username?: string } | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  useEffect(() => {
    if (searchParams.get('reddit_connected') === '1') {
      setFlash('Reddit connected — live post stats and replies are enabled.')
    }
    const redditError = searchParams.get('reddit_error')
    if (redditError) setError(`Reddit connection failed: ${redditError}`)
  }, [searchParams])

  useEffect(() => {
    fetch(`/api/reddit/auth/status?companyId=${companyId}`)
      .then(r => r.json())
      .then(d => setStatus(d as { connected: boolean; username?: string }))
      .catch(() => setStatus({ connected: false }))
  }, [companyId])

  async function disconnect() {
    if (!confirm('Disconnect Reddit? Monitors will fall back to RSS without live upvote counts.')) return
    setDisconnecting(true)
    setError(null)
    try {
      const res = await fetch(`/api/reddit/auth/disconnect?companyId=${companyId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to disconnect')
      setStatus({ connected: false })
      setFlash(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setDisconnecting(false)
    }
  }

  if (compact) {
    if (status === null) {
      return <div className="h-9 w-32 bg-zinc-800 rounded-lg animate-pulse" />
    }
    if (status.connected) {
      return (
        <div className="flex items-center gap-2 text-xs text-green-400">
          <Check className="w-3.5 h-3.5" />
          u/{status.username}
          <button type="button" onClick={disconnect} className="text-zinc-500 hover:text-red-400">
            {disconnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Disconnect'}
          </button>
        </div>
      )
    }
    return (
      <a
        href={`/api/reddit/auth/connect?companyId=${companyId}`}
        className="text-xs font-medium text-orange-400 hover:text-orange-300"
      >
        Connect Reddit for live stats →
      </a>
    )
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-orange-500/15 rounded-lg flex items-center justify-center shrink-0 font-bold text-orange-500 text-sm">
          r/
        </div>
        <div>
          <p className="text-sm font-medium text-white">Reddit</p>
          <p className="text-xs text-zinc-500">
            {status === null
              ? 'Checking…'
              : status.connected
                ? `Connected as u/${status.username} — monitors use the official API`
                : 'Connect for live upvotes, comments, and posting replies'}
          </p>
          {flash && (
            <p className="text-xs text-green-400 mt-0.5 flex items-center gap-1">
              <Check className="w-3 h-3" />{flash}
            </p>
          )}
          {error && (
            <p className="text-xs text-red-400 mt-0.5 flex items-center gap-1">
              <X className="w-3 h-3" />{error}
            </p>
          )}
        </div>
      </div>

      <div className="shrink-0">
        {status === null ? (
          <div className="w-24 h-8 bg-zinc-800 rounded-lg animate-pulse" />
        ) : status.connected ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs text-green-400 font-medium">
              <Check className="w-3.5 h-3.5" /> Connected
            </span>
            <button
              type="button"
              onClick={disconnect}
              disabled={disconnecting}
              className="text-xs text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-40 flex items-center gap-1"
            >
              {disconnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Link2Off className="w-3.5 h-3.5" /> Disconnect</>}
            </button>
          </div>
        ) : (
          <a
            href={`/api/reddit/auth/connect?companyId=${companyId}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Connect Reddit <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </div>
  )
}
