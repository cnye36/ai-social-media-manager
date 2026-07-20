import type { MediaItem } from '@/types/database'

/** Result from POST /api/generate/media */
export interface MediaResult {
  type: 'image'
  url: string
  storagePath: string
  /** Final prompt sent to the image model (user-written or agent-crafted). */
  promptUsed: string
  /** Accessibility alt text — generated for every image. */
  altText: string
}

/** Result from a completed video_jobs row (POST /api/generate/video + polling) */
export interface VideoResult {
  type: 'video'
  url: string
  storagePath: string
  /** Prompt sent to the video model (user-written or LLM-crafted suggestion). */
  promptUsed: string
}

export type GeneratedMediaResult = MediaResult | VideoResult

export function mediaItemFromResult(result: GeneratedMediaResult): MediaItem {
  return {
    type: result.type,
    url: result.url,
    storage_path: result.storagePath,
    ...(result.type === 'image' ? { alt_text: result.altText } : {}),
  }
}
