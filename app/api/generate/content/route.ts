import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generatePost, generatePostReadableStream } from '@/agents/index'
import type { Channel } from '@/types/database'
import type { ContentGoal, PostLength } from '@/types/agents'

export const maxDuration = 60

const VALID_CHANNELS: Channel[] = ['linkedin', 'x', 'reddit', 'facebook']
const VALID_GOALS: ContentGoal[] = ['awareness', 'engagement', 'promotion', 'education']
const VALID_LENGTHS: PostLength[] = ['short', 'medium', 'long']

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { companyId, channel, topic, contentGoal, postLength, additionalContext, stream, threadMode, includeDisclosure } = body

  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
  if (!VALID_CHANNELS.includes(channel)) return NextResponse.json({ error: 'Invalid channel' }, { status: 400 })
  if (!topic?.trim()) return NextResponse.json({ error: 'topic required' }, { status: 400 })
  if (!VALID_GOALS.includes(contentGoal)) return NextResponse.json({ error: 'Invalid contentGoal' }, { status: 400 })
  if (!VALID_LENGTHS.includes(postLength)) return NextResponse.json({ error: 'Invalid postLength' }, { status: 400 })

  // Verify company ownership
  const { data: company } = await supabase.from('companies').select('id').eq('id', companyId).single()
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  const generateRequest = {
    companyId,
    channel: channel as Channel,
    topic: topic.trim(),
    contentGoal: contentGoal as ContentGoal,
    postLength: postLength as PostLength,
    additionalContext: additionalContext?.trim(),
    threadMode: threadMode === true,
    includeDisclosure: channel === 'reddit' && includeDisclosure === true,
  }

  // Streaming response
  if (stream) {
    const textStream = await generatePostReadableStream(generateRequest)

    return new Response(textStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }

  // Non-streaming — return full post JSON (useful for saving to DB after generation)
  const post = await generatePost(generateRequest)
  return NextResponse.json(post)
}
