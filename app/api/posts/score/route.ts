import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { scorePost } from '@/lib/content/score-post'
import type { Channel } from '@/types/database'

const VALID_CHANNELS: Channel[] = ['linkedin', 'x', 'reddit', 'facebook']

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { content?: unknown; channel?: unknown }
  const { content, channel } = body

  if (typeof content !== 'string' || !content.trim()) {
    return NextResponse.json({ error: 'content required' }, { status: 400 })
  }
  if (!VALID_CHANNELS.includes(channel as Channel)) {
    return NextResponse.json({ error: 'invalid channel' }, { status: 400 })
  }

  const result = await scorePost(content, channel as Channel)
  return NextResponse.json(result)
}
