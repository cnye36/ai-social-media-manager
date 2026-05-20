import OpenAI from 'openai'
import { createAdminClient } from '@/lib/supabase/admin'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2'

/** Sizes supported by GPT Image models (gpt-image-1/2), not DALL-E 3. */
export type ImageSize = '1024x1024' | '1536x1024' | '1024x1536'

const LEGACY_DALLE3_SIZES: Record<string, ImageSize> = {
  '1792x1024': '1536x1024',
  '1024x1792': '1024x1536',
}

export function normalizeImageSize(size?: string): ImageSize {
  if (size === '1024x1024' || size === '1536x1024' || size === '1024x1536') return size
  if (size && size in LEGACY_DALLE3_SIZES) return LEGACY_DALLE3_SIZES[size]
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
  size?: ImageSize
  postId?: string
}): Promise<GeneratedImage> {
  const { prompt, companyId, size, postId } = params
  const apiSize = normalizeImageSize(size)

  const response = await openai.images.generate({
    model: IMAGE_MODEL,
    prompt,
    n: 1,
    size: apiSize,
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
    })
    if (error) console.warn('[media-library] image save failed:', error.message, error.code)
  })()

  return { url: publicUrl, storagePath: filename, promptUsed: prompt }
}
