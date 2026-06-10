import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { postBodyForPublish } from '@/lib/generate/image-prompt'
import type { Channel } from '@/types/database'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const CHANNEL_GUIDES: Record<Channel, string> = {
  linkedin:
    'Professional tone, thought leadership voice. 150–400 words. End with a question or insight that invites comments. No hashtag spam.',
  x:
    'Punchy and direct. Under 280 characters for singles, or write a 4–7 tweet thread if the content warrants depth. Personality over polish.',
  facebook:
    'Warm, community-first storytelling. 1–3 short paragraphs. Conversational and accessible. Ask a question to drive engagement.',
  reddit:
    'Peer-sharing voice — zero marketing speak, zero CTAs, zero hashtags. Include a genuine discussion question. Sound like a human, not a brand.',
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { targetChannel?: Channel; instruction?: string }
  const { targetChannel, instruction } = body

  if (!targetChannel) {
    return NextResponse.json({ error: 'targetChannel required' }, { status: 400 })
  }

  const { data: post } = await supabase
    .from('posts')
    .select('*')
    .eq('id', id)
    .single()

  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('id', post.company_id)
    .eq('owner_id', user.id)
    .single()

  if (!company) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: brand } = await supabase
    .from('brand_profiles')
    .select('brand_voice, company_description, tone_of_voice')
    .eq('company_id', post.company_id)
    .maybeSingle()

  const originalContent = postBodyForPublish(post.content ?? '')
  const sameChannel = post.channel === targetChannel

  const systemPrompt = `You are the social media manager for ${company.name}.
${brand?.brand_voice ? `Brand voice: ${brand.brand_voice}` : ''}
${brand?.tone_of_voice ? `Tone: ${brand.tone_of_voice}` : ''}
${brand?.company_description ? `Company: ${brand.company_description}` : ''}

Your job: remix the given post for ${targetChannel}.
${sameChannel
  ? 'This is a re-angle — same channel, completely fresh take. Use a different hook, structure, and angle. Do not repeat phrases from the original.'
  : `Adapt the core message and value for ${targetChannel}'s unique audience and format. Do not copy-paste — genuinely rewrite for the platform.`
}

${CHANNEL_GUIDES[targetChannel]}

${instruction ? `Special direction: ${instruction}` : ''}

Return ONLY the post content. No preamble, no explanation.`

  const completion = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Original post (${post.channel}):\n\n${originalContent}\n\nRemix for ${targetChannel}.`,
      },
    ],
    temperature: 0.85,
    max_tokens: 1200,
  })

  const remixedContent = completion.choices[0].message.content?.trim() ?? ''
  if (!remixedContent) {
    return NextResponse.json({ error: 'AI returned empty content' }, { status: 500 })
  }

  const originalTitle = typeof post.title === 'string' && post.title
    ? post.title.replace(/^\[Remix\]\s*/i, '')
    : null

  const { data: newPost, error } = await supabase
    .from('posts')
    .insert({
      company_id: post.company_id,
      channel: targetChannel,
      content: remixedContent,
      status: 'draft',
      title: originalTitle ? `[Remix] ${originalTitle}` : null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ post: newPost })
}
