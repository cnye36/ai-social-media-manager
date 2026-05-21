/** Result from POST /api/generate/media */
export interface MediaResult {
  type: 'image'
  url: string
  storagePath: string
}
