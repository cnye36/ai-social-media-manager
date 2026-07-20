import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { craftVideoPrompt } from '@/lib/media/video-prompt'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { postContent, channel, brandColors } = await req.json() as {
    postContent?: string
    channel?: string
    brandColors?: { primary?: string; accent?: string }
  }

  if (!postContent?.trim()) {
    return NextResponse.json({ error: 'postContent is required' }, { status: 400 })
  }

  try {
    const videoPrompt = await craftVideoPrompt({ postContent: postContent.trim(), channel, brandColors })
    return NextResponse.json({ videoPrompt })
  } catch (err) {
    console.error('[video-prompt]', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
