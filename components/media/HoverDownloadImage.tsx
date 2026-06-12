'use client'

import { useState, useEffect, useCallback, type ImgHTMLAttributes, type ReactNode } from 'react'
import { Download, Loader2, ZoomIn, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { downloadMediaFile } from '@/lib/media/download'
import { createPortal } from 'react-dom'

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

function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [handleKeyDown])

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close lightbox"
        className="absolute top-4 right-4 p-2 rounded-lg bg-zinc-900/85 text-white border border-white/15 hover:bg-zinc-800 transition-colors focus:outline-none focus:ring-1 focus:ring-violet-500"
      >
        <X className="w-5 h-5" />
      </button>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
        onClick={e => e.stopPropagation()}
      />
    </div>,
    document.body,
  )
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
  const [lightboxOpen, setLightboxOpen] = useState(false)

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

      <div
        className={cn(
          'absolute top-2 right-2 z-20 flex gap-1',
          'opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity',
        )}
      >
        <button
          type="button"
          onClick={e => { e.preventDefault(); e.stopPropagation(); setLightboxOpen(true) }}
          title="View full size"
          aria-label="View full size"
          className={cn(
            'p-2 rounded-lg',
            'bg-zinc-900/85 backdrop-blur-sm text-white border border-white/15 shadow-lg',
            'hover:bg-zinc-800 focus:outline-none focus:ring-1 focus:ring-violet-500',
            buttonClassName,
          )}
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={handleDownload}
          title="Download image"
          aria-label="Download image"
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

      {overlay}

      {lightboxOpen && <ImageLightbox src={src} alt={alt} onClose={() => setLightboxOpen(false)} />}
    </div>
  )
}
