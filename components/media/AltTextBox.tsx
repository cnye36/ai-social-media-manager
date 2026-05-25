'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AltTextBoxProps {
  value: string
  label?: string
  className?: string
}

export function AltTextBox({ value, label = 'Alt text', className }: AltTextBoxProps) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    if (!value.trim()) return
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium">
          {label}
        </label>
        <button
          type="button"
          onClick={copy}
          disabled={!value.trim()}
          className="flex items-center gap-1 text-[10px] font-medium text-zinc-500 hover:text-zinc-300 disabled:opacity-40 transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-green-400" />
              <span className="text-green-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              Copy
            </>
          )}
        </button>
      </div>
      <p className="text-xs text-zinc-300 leading-relaxed bg-zinc-900/80 border border-zinc-700 rounded-lg px-3 py-2.5 whitespace-pre-wrap">
        {value.trim() || '—'}
      </p>
    </div>
  )
}
