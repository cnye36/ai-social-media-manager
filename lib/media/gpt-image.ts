import OpenAI, { toFile } from 'openai'
import { createAdminClient } from '@/lib/supabase/admin'
import { MAX_ALT_TEXT_LENGTH } from '@/lib/media/alt-text'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2'

const NO_FAKE_BRANDING_RULE =
  'Do not invent or render any logos, business names, brand marks, or storefront/signage text anywhere in the image — leave surfaces, signage, and packaging unbranded and generic.'

const REAL_LOGO_RULE =
  'Incorporate the attached brand logo image exactly as shown — do not redraw, recolor, or otherwise alter it — placed as a small, tasteful badge in a corner of the composition, sized appropriately and not dominating the scene. Do not invent or render any other logos, business names, or brand marks.'

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
  /** Public URL of the company's real logo — when set, it's composited into the image instead of letting the model invent one. */
  logoUrl?: string | null
}): Promise<GeneratedImage> {
  const { prompt, companyId, size, postId, articleId, logoUrl } = params
  const apiSize = normalizeImageSize(size)

  const response = logoUrl
    ? await openai.images.edit({
        model: IMAGE_MODEL,
        image: await fetchLogoFile(logoUrl),
        prompt: `${prompt}\n\n${REAL_LOGO_RULE}`,
        n: 1,
        size: apiSize as ImageSize,
        quality: 'medium',
      })
    : await openai.images.generate({
        model: IMAGE_MODEL,
        prompt: `${prompt}\n\n${NO_FAKE_BRANDING_RULE}`,
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

/** Only fetch logos from our own Supabase Storage — logo_url is server-generated, but this
 * blocks SSRF if that ever changes (e.g. a future "import logo from URL" field). */
function assertOwnStorageUrl(logoUrl: string): void {
  const supabaseOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin
  if (new URL(logoUrl).origin !== supabaseOrigin) {
    throw new Error('Logo URL must be hosted on our own Supabase Storage')
  }
}

async function fetchLogoFile(logoUrl: string) {
  assertOwnStorageUrl(logoUrl)
  const res = await fetch(logoUrl)
  if (!res.ok) throw new Error(`Failed to fetch logo: ${res.status}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  return toFile(buffer, 'logo.png', { type: res.headers.get('content-type') ?? 'image/png' })
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
