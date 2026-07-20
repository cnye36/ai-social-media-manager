import OpenAI from 'openai'
import type { Channel } from '@/types/database'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const CHANNEL_VIDEO_RULES: Partial<Record<Channel, string>> = {
  linkedin: 'STYLE: A short motion-graphics style clip — an animated stat reveal, a simple data visualization coming to life, or a clean before/after transition. Professional, not flashy. No stock-footage-style people in generic office settings.',
  x: 'STYLE: A punchy, fast 4-8 second loop with one clear focal point — a bold stat animating in, a quick visual transformation, or a striking single scene. Built to stop a fast-scrolling feed, not to tell a story.',
  facebook: 'STYLE: A warm, candid-feeling short clip — a simple relatable scene, a milestone moment, or an authentic slice-of-life beat. Not a polished ad.',
}

function buildInstructions(channel?: string): string {
  const channelRules = CHANNEL_VIDEO_RULES[channel as Channel] ?? CHANNEL_VIDEO_RULES.linkedin
  return `You write prompts for an AI video generator (Sora) that produces short, eye-catching social media clips (4-8 seconds, no dialogue, no on-screen brand names or logos).

${channelRules}

Describe the scene, motion, camera behavior, palette, and pacing concretely enough for the model to render it consistently. Keep it to 2-4 sentences. Do not invent logos, brand names, or storefront text.`
}

/** Craft a Sora video prompt from post content — a fast, synchronous suggestion the user can edit before generating. */
export async function craftVideoPrompt(params: {
  postContent: string
  channel?: string
  brandColors?: { primary?: string; accent?: string }
}): Promise<string> {
  const { postContent, channel, brandColors } = params

  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: buildInstructions(channel) },
      {
        role: 'user',
        content: [
          `Post content:\n${postContent.trim().slice(0, 1200)}`,
          brandColors && (brandColors.primary || brandColors.accent)
            ? `Brand colors: ${JSON.stringify(brandColors)}`
            : null,
          'Return JSON: {"videoPrompt":"..."}',
        ].filter(Boolean).join('\n\n'),
      },
    ],
    response_format: { type: 'json_object' },
    max_completion_tokens: 300,
    temperature: 0.7,
  })

  const parsed = JSON.parse(res.choices[0]?.message?.content ?? '{}') as { videoPrompt?: string }
  const prompt = parsed.videoPrompt?.trim()
  if (!prompt) throw new Error('Failed to craft a video prompt')
  return prompt
}
