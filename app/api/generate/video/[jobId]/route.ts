import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkVideoJob, storeCompletedVideo } from '@/lib/media/sora-video'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: job, error } = await supabase
    .from('video_jobs')
    .select('*')
    .eq('id', jobId)
    .single()
  if (error || !job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  if (job.status === 'completed' || job.status === 'failed' || !job.openai_video_id) {
    return NextResponse.json(job)
  }

  try {
    const remote = await checkVideoJob(job.openai_video_id)

    if (remote.status === 'completed') {
      const { url, storagePath } = await storeCompletedVideo({
        openaiVideoId: job.openai_video_id,
        companyId: job.company_id,
        prompt: job.prompt,
        postId: job.post_id ?? undefined,
      })
      const { data: updated } = await supabase
        .from('video_jobs')
        .update({ status: 'completed', progress: 100, url, storage_path: storagePath, completed_at: new Date().toISOString() })
        .eq('id', jobId)
        .select('*')
        .single()
      return NextResponse.json(updated ?? job)
    }

    if (remote.status === 'failed') {
      const { data: updated } = await supabase
        .from('video_jobs')
        .update({ status: 'failed', error_message: remote.errorMessage ?? 'Video generation failed', completed_at: new Date().toISOString() })
        .eq('id', jobId)
        .select('*')
        .single()
      return NextResponse.json(updated ?? job)
    }

    const { data: updated } = await supabase
      .from('video_jobs')
      .update({ status: remote.status, progress: remote.progress })
      .eq('id', jobId)
      .select('*')
      .single()
    return NextResponse.json(updated ?? job)
  } catch (err) {
    console.error('[video-job-poll]', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
