'use client'

import { useState, useEffect } from 'react'
import { Check, Link2, Link2Off, RefreshCw, AlertCircle, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Integration {
  id: string
  connected_at: string
}

export function BufferConnect({ companyId }: { companyId: string }) {
  const [integration, setIntegration] = useState<Integration | null | undefined>(undefined)
  const [token, setToken] = useState('')
  const [showReconnect, setShowReconnect] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/buffer?companyId=${companyId}`)
      .then(r => r.json())
      .then(d => setIntegration(d as Integration | null))
      .catch(() => setIntegration(null))
  }, [companyId])

  async function handleConnect() {
    if (!token.trim()) return
    setLoading(true)
    setError('')
    const res = await fetch('/api/buffer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId,
        accessToken: token.trim(),
      }),
    })
    const data = await res.json() as { error?: string }
    setLoading(false)
    if (!res.ok) {
      setError(data.error ?? 'Connection failed')
      return
    }
    setIntegration({ id: '', connected_at: new Date().toISOString() })
    setToken('')
    setShowReconnect(false)
  }

  async function handleDisconnect() {
    if (!confirm('Disconnect Buffer? Posts will fall back to direct platform adapters.')) return
    setLoading(true)
    await fetch(`/api/buffer?companyId=${companyId}`, { method: 'DELETE' })
    setIntegration(null)
    setToken('')
    setShowReconnect(false)
    setLoading(false)
  }

  if (integration === undefined) {
    return <div className="h-32 rounded-xl bg-zinc-800/50 animate-pulse" />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#e8f5e8] flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#168F48">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm6.8 14.56l-6.5 3.44a.7.7 0 01-.6 0l-6.5-3.44a.7.7 0 010-1.12l6.5-3.44a.7.7 0 01.6 0l6.5 3.44a.7.7 0 010 1.12zM12 10.28L5.5 6.84a.7.7 0 010-1.12l6.2-3.28a.7.7 0 01.6 0l6.2 3.28a.7.7 0 010 1.12L12 10.28z"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-white">Buffer</p>
            <p className="text-xs text-zinc-500">Schedule and publish to LinkedIn, X, and Facebook</p>
          </div>
        </div>
        {integration ? (
          <div className="flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 text-green-400" />
            <span className="text-xs text-green-400">Connected</span>
          </div>
        ) : (
          <span className="text-xs text-zinc-600">Not connected</span>
        )}
      </div>

      {integration && !showReconnect && (
        <div className="space-y-2">
          <p className="text-[11px] text-zinc-600 leading-relaxed">
            Posts are only sent to Buffer when you click <span className="text-zinc-400">Send to Buffer</span> on a scheduled post.
            Your app schedule time is used — Buffer will not pick the next open slot.
          </p>
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="ghost" onClick={() => setShowReconnect(true)} className="text-xs text-zinc-500">
              <RefreshCw className="w-3 h-3" />
              Reconnect
            </Button>
            <Button
              size="sm" variant="ghost" onClick={handleDisconnect} disabled={loading}
              className="text-xs text-red-400 hover:text-red-300 hover:bg-red-400/10"
            >
              <Link2Off className="w-3 h-3" />
              Disconnect
            </Button>
          </div>
        </div>
      )}

      {(!integration || showReconnect) && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400 font-medium">Buffer MCP API key</label>
            <input
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleConnect()}
              placeholder="Paste your MCP API key"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-500/60"
            />
            <p className="text-[11px] text-zinc-600 leading-relaxed">
              Found at{' '}
              <a
                href="https://publish.buffer.com/settings/integrations/mcp"
                target="_blank" rel="noopener noreferrer"
                className="text-violet-400 hover:text-violet-300 inline-flex items-center gap-0.5"
              >
                publish.buffer.com/settings/integrations/mcp <ExternalLink className="w-2.5 h-2.5" />
              </a>
              . Each company can use its own key for a separate Buffer workspace.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-2">
            <Button size="sm" onClick={handleConnect} disabled={loading || !token.trim()}>
              <Link2 className="w-3.5 h-3.5" />
              {loading ? 'Connecting…' : 'Connect Buffer'}
            </Button>
            {showReconnect && (
              <Button size="sm" variant="ghost" onClick={() => { setShowReconnect(false); setError('') }}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
