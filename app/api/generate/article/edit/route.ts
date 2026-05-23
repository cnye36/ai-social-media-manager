import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 60

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { companyId, currentBody, instruction } = body as {
    companyId: string
    currentBody: string
    instruction: string
  }

  if (!companyId || !currentBody || !instruction?.trim()) {
    return NextResponse.json({ error: 'companyId, currentBody, and instruction required' }, { status: 400 })
  }

  const { data: company } = await supabase
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .eq('owner_id', user.id)
    .single()
  if (!company) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: brand } = await supabase
    .from('brand_profiles')
    .select('tone, voice_notes, avoid_phrases')
    .eq('company_id', companyId)
    .maybeSingle()

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
          content: `You are an expert editor for ${company.name}. Edit the given markdown article based on the user's instruction. ${brandHints ? `\n\nBrand context:\n${brandHints}` : ''}

Rules:
- Return ONLY the complete edited markdown article — no explanations, no preamble
- Preserve all existing internal markdown links unless instructed to change them
- Keep the same overall structure unless instructed otherwise
- Match the brand voice`,
        },
        {
          role: 'user',
          content: `Instruction: ${instruction}\n\nArticle to edit:\n\n${currentBody}`,
        },
      ],
      max_completion_tokens: 3000,
      temperature: 0.6,
    })

    const edited = completion.choices[0]?.message?.content ?? currentBody
    return NextResponse.json({ body: edited })
  } catch (err) {
    console.error('Article edit error:', err)
    return NextResponse.json({ error: 'Failed to edit article' }, { status: 500 })
  }
}
