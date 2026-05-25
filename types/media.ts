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

export function mediaItemFromResult(result: MediaResult): MediaItem {
  return {
    type: 'image',
    url: result.url,
    storage_path: result.storagePath,
    alt_text: result.altText,
  }
}
