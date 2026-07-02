import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { NO_EM_DASH_RULE, stripEmDashes } from '@/lib/content/no-em-dash'
import { CRITERIA } from '@/lib/content/score-post'
import type { Channel } from '@/types/database'

export const maxDuration = 60

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { content?: unknown; instruction?: unknown }
  const { content, instruction } = body

  if (typeof content !== 'string' || !content.trim() || typeof instruction !== 'string' || !instruction.trim()) {
    return NextResponse.json({ error: 'content and instruction required' }, { status: 400 })
  }

  const { data: post } = await supabase
    .from('posts')
    .select('company_id, channel')
    .eq('id', id)
    .single()
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('id', post.company_id)
    .eq('owner_id', user.id)
    .single()
  if (!company) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: brand } = await supabase
    .from('brand_profiles')
    .select('tone, voice_notes, avoid_phrases')
    .eq('company_id', post.company_id)
    .maybeSingle()

  const channel = post.channel as Channel
  const brandHints = [
    brand?.tone && `Tone: ${brand.tone}`,
    brand?.voice_notes && `Voice: ${brand.voice_notes}`,
    brand?.avoid_phrases?.length && `Avoid: ${brand.avoid_phrases.join(', ')}`,
  ].filter(Boolean).join('\n')

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-5.4-mini',
      messages: [
        {
          role: 'system',
          content: `You are an expert ${channel} copywriter. Edit the given post based on the instruction below. Make the smallest possible edit — fix only what the instruction describes and leave the rest of the post untouched.${brandHints ? `\n\nBrand context:\n${brandHints}` : ''}

${channel.toUpperCase()} CRITERIA:
${CRITERIA[channel]}
${NO_EM_DASH_RULE}

Return ONLY the edited post content — no explanations, no preamble, no surrounding quotes.`,
        },
        {
          role: 'user',
          content: `Instruction: ${instruction}\n\nPost to edit:\n\n${content}`,
        },
      ],
      max_completion_tokens: 800,
      temperature: 0.6,
    })

    const edited = stripEmDashes(completion.choices[0]?.message?.content?.trim() ?? '')
    if (!edited) return NextResponse.json({ error: 'AI returned empty content' }, { status: 500 })

    return NextResponse.json({ content: edited })
  } catch (err) {
    console.error('Post fix error:', err)
    return NextResponse.json({ error: 'Failed to fix post' }, { status: 500 })
  }
}
