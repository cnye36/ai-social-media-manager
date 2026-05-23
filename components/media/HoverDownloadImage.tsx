'use client'

import { useState, type ImgHTMLAttributes, type ReactNode } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { downloadMediaFile } from '@/lib/media/download'

interface HoverDownloadImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> {
  src: string
  alt: string
  /** Wrapper element classes (use `group` is applied automatically) */
  wrapperClassName?: string
  downloadFilename?: string
  /** Extra overlay content shown on hover (below the download control) */
  overlay?: ReactNode
  buttonClassName?: string
}

export function HoverDownloadImage({
  src,
  alt,
  className,
  wrapperClassName,
  downloadFilename,
  overlay,
  buttonClassName,
  ...imgProps
}: HoverDownloadImageProps) {
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className={className} {...imgProps} />

      <button
        type="button"
        onClick={handleDownload}
        title="Download image"
        aria-label="Download image"
        className={cn(
          'absolute top-2 right-2 z-20 p-2 rounded-lg',
          'bg-zinc-900/85 backdrop-blur-sm text-white border border-white/15 shadow-lg',
          'opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity',
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

      {overlay}
    </div>
  )
}
