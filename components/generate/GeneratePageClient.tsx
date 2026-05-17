'use client'

import { useState } from 'react'
import { ImageIcon } from 'lucide-react'
import { GenerateForm } from './GenerateForm'
import { PostPreview } from './PostPreview'
import { MediaPanel } from './MediaPanel'
import { cn } from '@/lib/utils'
import type { Channel, Post } from '@/types/database'

interface MediaResult {
  type: 'image' | 'infographic'
  url: string
  storagePath: string
  svg?: string
}

interface GeneratePageClientProps {
  companyId: string
  brandColors?: { primary?: string; accent?: string }
}

export function GeneratePageClient({ companyId, brandColors }: GeneratePageClientProps) {
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null)
  const [content, setContent] = useState('')
  const [imagePrompt, setImagePrompt] = useState<string | undefined>()
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState('')
  const [batchErrors, setBatchErrors] = useState<string[]>([])
  const [lastParams, setLastParams] = useState<Record<string, unknown>>({})
  const [showMedia, setShowMedia] = useState(false)
  const [acceptedMedia, setAcceptedMedia] = useState<MediaResult | null>(null)
  const [batchMode, setBatchMode] = useState(false)

  const postReady = !isStreaming && !!content && !!activeChannel && !batchMode

  function handleStream(channel: Channel) {
    setBatchMode(false)
    setActiveChannel(channel)
    setContent('')
    setImagePrompt(undefined)
    setIsStreaming(true)
    setError('')
    setBatchErrors([])
    setShowMedia(false)
    setAcceptedMedia(null)
  }

  function handleChunk(chunk: string) {
    setContent(prev => prev + chunk)
  }

  function handleDone(imgPrompt?: string) {
    setIsStreaming(false)
    setImagePrompt(imgPrompt)
  }

  function handleError(msg: string) {
    setIsStreaming(false)
    setError(msg)
  }

  function handleBatchComplete(_posts: Post[], errors: string[]) {
    setBatchMode(true)
    setActiveChannel(null)
    setContent('')
    setBatchErrors(errors)
    setIsStreaming(false)
  }

  function handleReset() {
    setActiveChannel(null)
    setContent('')
    setImagePrompt(undefined)
    setError('')
    setBatchErrors([])
    setBatchMode(false)
    setShowMedia(false)
    setAcceptedMedia(null)
  }

  function handleAcceptMedia(result: MediaResult) {
    setAcceptedMedia(result)
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Generate</h1>
          <p className="text-zinc-400 mt-1 text-sm">
            Select one channel for live preview with media, or multiple to generate drafts for each platform
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <GenerateForm
              companyId={companyId}
              onStream={handleStream}
              onChunk={handleChunk}
              onDone={handleDone}
              onError={handleError}
              onBatchComplete={handleBatchComplete}
            />
            {error && (
              <p className="mt-4 text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-4 py-3">
                {error}
              </p>
            )}
          </div>

          <div className="sticky top-8 space-y-4">
            {batchMode ? (
              <div className="flex flex-col items-center justify-center h-80 text-center border border-dashed border-zinc-700 rounded-xl px-6">
                <p className="text-zinc-300 text-sm font-medium">Multi-channel drafts created</p>
                <p className="text-zinc-500 text-xs mt-2">
                  Review them in the form on the left, then schedule or edit from Posts or Calendar.
                </p>
                {batchErrors.length > 0 && (
                  <p className="text-red-400 text-xs mt-3">
                    Some channels failed — see errors in the form.
                  </p>
                )}
                <button
                  onClick={handleReset}
                  className="mt-4 text-sm text-violet-400 hover:text-violet-300"
                >
                  Generate again
                </button>
              </div>
            ) : (
              <PostPreview
                channel={activeChannel}
                content={content}
                imagePrompt={imagePrompt}
                isStreaming={isStreaming}
                companyId={companyId}
                onReset={handleReset}
                generationParams={lastParams}
                acceptedMedia={acceptedMedia}
              />
            )}

            {postReady && (
              <button
                onClick={() => setShowMedia(v => !v)}
                className={cn(
                  'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-colors',
                  showMedia
                    ? 'border-violet-500/40 bg-violet-600/10 text-violet-300 hover:bg-violet-600/20'
                    : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-white hover:border-zinc-600'
                )}
              >
                <ImageIcon className="w-4 h-4" />
                {showMedia ? 'Hide media panel' : 'Add media'}
                {acceptedMedia && !showMedia && (
                  <span className="text-[10px] bg-violet-600/30 text-violet-300 px-1.5 py-0.5 rounded">
                    {acceptedMedia.type === 'image' ? 'Image' : 'Infographic'}
                  </span>
                )}
              </button>
            )}

            {postReady && showMedia && activeChannel && (
              <MediaPanel
                postContent={content}
                companyId={companyId}
                channel={activeChannel}
                brandColors={brandColors}
                onAccept={handleAcceptMedia}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
