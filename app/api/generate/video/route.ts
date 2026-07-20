import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createVideoJob, type VideoSeconds, type VideoSize } from '@/lib/media/sora-video'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { prompt, companyId, postId, size, seconds } = await req.json() as {
    prompt?: string
    companyId?: string
    postId?: string
    size?: VideoSize
    seconds?: VideoSeconds
  }

  if (!prompt?.trim()) return NextResponse.json({ error: 'prompt is required' }, { status: 400 })
  if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 })

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  try {
    const { openaiVideoId, status } = await createVideoJob({ prompt: prompt.trim(), size, seconds })

    const { data: job, error } = await supabase
      .from('video_jobs')
      .insert({
        company_id: companyId,
        post_id: postId ?? null,
        prompt: prompt.trim(),
        size: size ?? '1280x720',
        seconds: seconds ?? '4',
        status,
        openai_video_id: openaiVideoId,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ jobId: job.id }, { status: 202 })
  } catch (err) {
    console.error('[generate-video]', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
