/** Result from POST /api/generate/media */
export interface MediaResult {
  type: 'image'
  url: string
  storagePath: string
  /** Final prompt sent to the image model (user-written or agent-crafted). */
  promptUsed: string
}
