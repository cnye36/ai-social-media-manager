import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { NO_EM_DASH_RULE, stripEmDashes } from '@/lib/content/no-em-dash'

export const maxDuration = 30

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const DEFAULT_LIMIT = 280

// Shortens a single piece of post content to fit under a character limit — used to
// fix over-limit X posts/tweets without regenerating the whole post from scratch.
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { content?: unknown; companyId?: unknown; limit?: unknown }
  const { content, companyId } = body
  const limit = typeof body.limit === 'number' && body.limit > 0 ? body.limit : DEFAULT_LIMIT

  if (typeof content !== 'string' || !content.trim()) {
    return NextResponse.json({ error: 'content required' }, { status: 400 })
  }
  if (typeof companyId !== 'string' || !companyId.trim()) {
    return NextResponse.json({ error: 'companyId required' }, { status: 400 })
  }

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .eq('owner_id', user.id)
    .single()
  if (!company) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: brand } = await supabase
    .from('brand_profiles')
    .select('tone, voice_notes')
    .eq('company_id', companyId)
    .maybeSingle()

  const brandHints = [
    brand?.tone && `Tone: ${brand.tone}`,
    brand?.voice_notes && `Voice: ${brand.voice_notes}`,
  ].filter(Boolean).join('\n')

  const systemPrompt = `You are an expert X (Twitter) copywriter. Shorten the given post so it is under ${limit} characters, while keeping the same message, hook, and voice. Cut words and trim phrasing — do not just delete the ending. Never pad with filler to reach the limit.${brandHints ? `\n\nBrand context:\n${brandHints}` : ''}
${NO_EM_DASH_RULE}

Return ONLY the shortened post content — no explanations, no preamble, no surrounding quotes, no character count.`

  async function shorten(original: string, extraInstruction?: string): Promise<string> {
    const completion = await openai.chat.completions.create({
      model: 'gpt-5.4-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: extraInstruction
            ? `${extraInstruction}\n\nPost to shorten:\n\n${original}`
            : `Post to shorten:\n\n${original}`,
        },
      ],
      max_completion_tokens: 400,
      temperature: 0.5,
    })
    return stripEmDashes(completion.choices[0]?.message?.content?.trim() ?? '')
  }

  try {
    let shortened = await shorten(content)
    if (!shortened) return NextResponse.json({ error: 'AI returned empty content' }, { status: 500 })

    if (shortened.length > limit) {
      const retried = await shorten(
        shortened,
        `Still ${shortened.length - limit} characters too long. Cut more — be more aggressive.`,
      )
      if (retried) shortened = retried
    }

    return NextResponse.json({ content: shortened, overLimit: shortened.length > limit })
  } catch (err) {
    console.error('Post shorten error:', err)
    return NextResponse.json({ error: 'Failed to shorten post' }, { status: 500 })
  }
}
