import OpenAI from 'openai'
import { createAdminClient } from '@/lib/supabase/admin'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const VIDEO_MODEL = process.env.OPENAI_VIDEO_MODEL ?? 'sora-2'

export type VideoSize = '720x1280' | '1280x720' | '1024x1792' | '1792x1024'
export type VideoSeconds = '4' | '8' | '12'

/** Kick off a Sora video generation job. Returns immediately with a queued job id. */
export async function createVideoJob(params: {
  prompt: string
  size?: VideoSize
  seconds?: VideoSeconds
}): Promise<{ openaiVideoId: string; status: string }> {
  const video = await openai.videos.create({
    prompt: params.prompt,
    model: VIDEO_MODEL,
    size: params.size ?? '1280x720',
    seconds: params.seconds ?? '4',
  })
  return { openaiVideoId: video.id, status: video.status }
}

export interface VideoJobStatus {
  status: 'queued' | 'in_progress' | 'completed' | 'failed'
  progress: number
  errorMessage?: string
}

export async function checkVideoJob(openaiVideoId: string): Promise<VideoJobStatus> {
  const video = await openai.videos.retrieve(openaiVideoId)
  return {
    status: video.status,
    progress: video.progress ?? 0,
    errorMessage: video.error?.message,
  }
}

/** Download the completed video and store it in Supabase Storage + media_library. */
export async function storeCompletedVideo(params: {
  openaiVideoId: string
  companyId: string
  prompt: string
  postId?: string
}): Promise<{ url: string; storagePath: string }> {
  const { openaiVideoId, companyId, prompt, postId } = params

  const response = await openai.videos.downloadContent(openaiVideoId)
  const buffer = Buffer.from(await response.arrayBuffer())
  const filename = `${companyId}/${Date.now()}-${openaiVideoId}.mp4`

  const supabase = createAdminClient()
  const { error } = await supabase.storage
    .from('media')
    .upload(filename, buffer, { contentType: 'video/mp4', upsert: false })
  if (error) throw new Error(`Storage upload failed: ${error.message}`)

  const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(filename)

  const { error: libraryError } = await supabase.from('media_library').insert({
    company_id: companyId,
    storage_path: filename,
    url: publicUrl,
    prompt: prompt.slice(0, 500),
    type: 'video',
    svg: null,
    post_id: postId ?? null,
  })
  if (libraryError) console.warn('[media-library] video save failed:', libraryError.message, libraryError.code)

  return { url: publicUrl, storagePath: filename }
}
