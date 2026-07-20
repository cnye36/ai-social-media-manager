'use client'

import { useState, type VideoHTMLAttributes } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { downloadMediaFile } from '@/lib/media/download'

interface HoverDownloadVideoProps extends Omit<VideoHTMLAttributes<HTMLVideoElement>, 'src'> {
  src: string
  wrapperClassName?: string
  downloadFilename?: string
  buttonClassName?: string
}

export function HoverDownloadVideo({
  src,
  className,
  wrapperClassName,
  downloadFilename,
  buttonClassName,
  ...videoProps
}: HoverDownloadVideoProps) {
  const [downloading, setDownloading] = useState(false)

  async function handleDownload(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (downloading) return
    setDownloading(true)
    try {
      await downloadMediaFile(src, downloadFilename)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className={cn('relative group', wrapperClassName)}>
      <video src={src} controls className={className} {...videoProps} />

      <div
        className={cn(
          'absolute top-2 right-2 z-20 flex gap-1',
          'opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity',
        )}
      >
        <button
          type="button"
          onClick={handleDownload}
          title="Download video"
          aria-label="Download video"
          className={cn(
            'p-2 rounded-lg',
            'bg-zinc-900/85 backdrop-blur-sm text-white border border-white/15 shadow-lg',
            'hover:bg-zinc-800 focus:outline-none focus:ring-1 focus:ring-violet-500',
            buttonClassName,
          )}
        >
          {downloading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  )
}
