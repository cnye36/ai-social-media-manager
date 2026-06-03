import OpenAI from 'openai'
import { createAdminClient } from '@/lib/supabase/admin'
import { MAX_ALT_TEXT_LENGTH } from '@/lib/media/alt-text'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2'

/** Common preset sizes for GPT Image models. */
export type ImageSize =
  | '1024x1024'
  | '1536x1024'
  | '1024x1536'
  | '1792x1024'
  | '1024x1792'

const PRESET_SIZES = new Set<string>([
  '1024x1024',
  '1536x1024',
  '1024x1536',
  '1792x1024',
  '1024x1792',
])

function parseWxH(size: string): { w: number; h: number } | null {
  const m = /^(\d+)x(\d+)$/.exec(size.trim())
  if (!m) return null
  const w = Number(m[1])
  const h = Number(m[2])
  if (!Number.isFinite(w) || !Number.isFinite(h)) return null
  return { w, h }
}

/** gpt-image-2 accepts any WxH that satisfies OpenAI size constraints. */
export function isValidGptImage2Size(w: number, h: number): boolean {
  const long = Math.max(w, h)
  const short = Math.min(w, h)
  if (long > 3840) return false
  if (w % 16 !== 0 || h % 16 !== 0) return false
  if (long / short > 3) return false
  const pixels = w * h
  return pixels >= 655_360 && pixels <= 8_294_400
}

export function normalizeImageSize(size?: string): string {
  if (size) {
    if (PRESET_SIZES.has(size)) return size
    const parsed = parseWxH(size)
    if (parsed && isValidGptImage2Size(parsed.w, parsed.h)) return size
  }
  return '1536x1024'
}

export interface GeneratedImage {
  url: string
  storagePath: string
  promptUsed: string
}

export async function generateImage(params: {
  prompt: string
  companyId: string
  size?: string
  postId?: string
  articleId?: string
}): Promise<GeneratedImage> {
  const { prompt, companyId, size, postId, articleId } = params
  const apiSize = normalizeImageSize(size)

  const response = await openai.images.generate({
    model: IMAGE_MODEL,
    prompt,
    n: 1,
    size: apiSize as ImageSize,
    quality: 'medium'
  })

  const item = response.data?.[0] as { b64_json?: string } | undefined
  const b64 = item?.b64_json
  if (!b64) throw new Error('No image data returned from OpenAI')

  const buffer = Buffer.from(b64, 'base64')
  const filename = `${companyId}/${Date.now()}.png`

  const supabase = createAdminClient()
  const { error } = await supabase.storage
    .from('media')
    .upload(filename, buffer, { contentType: 'image/png', upsert: false })

  if (error) throw new Error(`Storage upload failed: ${error.message}`)

  const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(filename)

  // Fire-and-forget — never block image delivery on a library write
  void (async () => {
    const { error } = await supabase.from('media_library').insert({
      company_id: companyId,
      storage_path: filename,
      url: publicUrl,
      prompt: prompt.slice(0, 500),
      type: 'image',
      svg: null,
      post_id: postId ?? null,
      article_id: articleId ?? null,
    })
    if (error) console.warn('[media-library] image save failed:', error.message, error.code)
  })()

  return { url: publicUrl, storagePath: filename, promptUsed: prompt }
}

/** Backfill alt text on the library row created during generateImage. */
export async function updateMediaLibraryAlt(storagePath: string, altText: string): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('media_library')
    .update({ alt_text: altText.slice(0, MAX_ALT_TEXT_LENGTH) })
    .eq('storage_path', storagePath)
  if (error) console.warn('[media-library] alt_text update failed:', error.message)
}
