'use client'

import { cn } from '@/lib/utils'

interface ImagePromptBoxProps {
  label: string
  value: string
  onChange?: (value: string) => void
  placeholder?: string
  readOnly?: boolean
  hint?: string
  className?: string
}

export function ImagePromptBox({
  label,
  value,
  onChange,
  placeholder = 'Describe the image you want to generate…',
  readOnly = false,
  hint,
  className,
}: ImagePromptBoxProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium">
        {label}
      </label>
      {readOnly ? (
        <p className="text-xs text-zinc-300 leading-relaxed bg-zinc-900/80 border border-zinc-700 rounded-lg px-3 py-2.5 whitespace-pre-wrap">
          {value || '—'}
        </p>
      ) : (
        <textarea
          value={value}
          onChange={e => onChange?.(e.target.value)}
          placeholder={placeholder}
          rows={4}
          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 leading-relaxed resize-y min-h-[88px] focus:outline-none focus:border-violet-500/60 placeholder:text-zinc-600"
        />
      )}
      {hint && <p className="text-[10px] text-zinc-600">{hint}</p>}
    </div>
  )
}
