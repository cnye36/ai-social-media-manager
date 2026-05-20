'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { LayoutTemplate, Check, Loader2, X, ExternalLink } from 'lucide-react'

interface CanvaConnectProps {
  companyId: string
}

export function CanvaConnect({ companyId }: CanvaConnectProps) {
  const searchParams = useSearchParams()
  const [connected, setConnected] = useState<boolean | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  useEffect(() => {
    if (searchParams.get('canva_connected') === '1') {
      setFlash('Canva connected successfully!')
    }
    const canvaError = searchParams.get('canva_error')
    if (canvaError) setError(`Canva connection failed: ${canvaError}`)
  }, [searchParams])

  useEffect(() => {
    fetch('/api/canva/status')
      .then(r => r.json())
      .then(d => setConnected(d.connected))
      .catch(() => setConnected(false))
  }, [])

  async function disconnect() {
    setDisconnecting(true)
    setError(null)
    try {
      const res = await fetch('/api/canva/disconnect', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to disconnect')
      setConnected(false)
      setFlash(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-[#7D2AE8]/15 rounded-lg flex items-center justify-center shrink-0">
          <LayoutTemplate className="w-5 h-5 text-[#7D2AE8]" />
        </div>
        <div>
          <p className="text-sm font-medium text-white">Canva</p>
          <p className="text-xs text-zinc-500">
            {connected === null
              ? 'Checking…'
              : connected
              ? 'Connected — edit generated images in Canva'
              : 'Not connected — connect to edit images in Canva'
            }
          </p>
          {flash && <p className="text-xs text-green-400 mt-0.5 flex items-center gap-1"><Check className="w-3 h-3" />{flash}</p>}
          {error && <p className="text-xs text-red-400 mt-0.5 flex items-center gap-1"><X className="w-3 h-3" />{error}</p>}
        </div>
      </div>

      <div className="shrink-0">
        {connected === null ? (
          <div className="w-24 h-8 bg-zinc-800 rounded-lg animate-pulse" />
        ) : connected ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs text-green-400 font-medium">
              <Check className="w-3.5 h-3.5" /> Connected
            </span>
            <button
              onClick={disconnect}
              disabled={disconnecting}
              className="text-xs text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-40"
            >
              {disconnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Disconnect'}
            </button>
          </div>
        ) : (
          <a
            href={`/api/canva/connect?companyId=${companyId}`}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#7D2AE8] hover:bg-[#6b25cc] text-white rounded-lg text-sm font-medium transition-colors"
          >
            Connect
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </div>
  )
}
