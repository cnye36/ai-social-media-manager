import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const MAX_ALT_LENGTH = 125

export async function generateImageAltText(params: {
  promptUsed: string
  postContent?: string
  channel?: string
  purpose?: 'cover' | 'inline' | 'social'
}): Promise<string> {
  const { promptUsed, postContent, channel, purpose } = params

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You write accessibility alt text for marketing images.
Write one concise sentence (max ${MAX_ALT_LENGTH} characters). Describe what a sighted user would see — subject, action, mood, key text on the image if any.
Avoid "image of", hashtags, and prompt jargon. Plain language only.`,
        },
        {
          role: 'user',
          content: [
            channel && `Context: ${channel} post`,
            purpose && `Purpose: ${purpose}`,
            postContent?.trim() && `Content:\n${postContent.trim().slice(0, 900)}`,
            `Visual brief used to generate the image:\n${promptUsed.trim().slice(0, 1200)}`,
            'Return JSON: {"altText":"..."}',
          ]
            .filter(Boolean)
            .join('\n\n'),
        },
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 80,
      temperature: 0.3,
    })

    const parsed = JSON.parse(res.choices[0]?.message?.content ?? '{}') as { altText?: string }
    const alt = parsed.altText?.trim()
    if (alt) return alt.slice(0, MAX_ALT_LENGTH)
  } catch (err) {
    console.warn('[alt-text] generation failed:', (err as Error).message)
  }

  return fallbackAltText(promptUsed)
}

function fallbackAltText(promptUsed: string): string {
  const cleaned = promptUsed
    .replace(/\b(high quality|professional|social media optimized|legible text)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  return (cleaned || 'Generated marketing image').slice(0, MAX_ALT_LENGTH)
}
