import { Agent, run, tool } from '@openai/agents'
import { z } from 'zod'
import { generateImage } from '@/lib/media/gpt-image'
import type { MediaResult } from '@/types/media'

const GenerateImageParams = z.object({
  prompt: z.string().describe(
    'Detailed image generation prompt. Specify style, mood, colors, composition. For infographics, diagrams, or charts: describe layout, headings, labels, icons, and data clearly so they render legibly in the image.'
  ),
  size: z
    .enum(['1024x1024', '1536x1024', '1024x1536'])
    .default('1536x1024')
    .describe(
      'Image dimensions. Use 1536x1024 for landscape (most social posts), 1024x1536 for portrait (Stories/Reels), 1024x1024 for square.'
    ),
})

function makeGenerateImageTool(companyId: string, postId?: string) {
  return tool({
    name: 'generate_image',
    description:
      'Generate an image with AI. Use for photography, illustrations, backgrounds, infographics, diagrams, charts, step-by-step visuals, stat cards, and comparison graphics — all as a single rendered image.',
    parameters: GenerateImageParams,
    execute: async (params) => {
      const result = await generateImage({ ...params, companyId, postId })
      return JSON.stringify({
        url: result.url,
        storagePath: result.storagePath,
        type: 'image',
      })
    },
  })
}

function buildMediaAgent(companyId: string, postId?: string): Agent {
  return new Agent({
    name: 'MediaAgent',
    model: 'gpt-5.4',
    instructions: `You are a creative media specialist for social media content. Analyze the post and call generate_image once to create the perfect accompanying visual.

PROMPT QUALITY:
- Craft rich, specific prompts: style (photographic / illustrated / flat infographic), mood, lighting, palette, composition.
- Include "high quality, professional, social media optimized, legible text" when the visual needs labels or data.
- For statistics, processes, comparisons, or lists: describe an infographic-style layout (sections, headings, icons, numbers) so it renders clearly in one image — do not rely on separate layout tools.

BRAND COLORS:
- Default: violet primary (#7c3aed), soft accent (#a78bfa) when no brand colors are given.
- Apply brand colors from the user message when provided.

Call generate_image exactly once. Return only the tool result — no commentary.`,
    tools: [makeGenerateImageTool(companyId, postId)],
  })
}

type AgentRunResult = {
  finalOutput?: unknown
  newItems: Array<{ type: string; output?: unknown }>
}

function parseMediaResult(result: AgentRunResult): MediaResult {
  const tryParse = (raw: string): MediaResult | null => {
    try {
      const parsed = JSON.parse(raw) as MediaResult
      if (parsed?.url && parsed?.storagePath && parsed?.type === 'image') return parsed
      return null
    } catch {
      return null
    }
  }

  if (result.finalOutput) {
    const raw =
      typeof result.finalOutput === 'string'
        ? result.finalOutput
        : JSON.stringify(result.finalOutput)
    const parsed = tryParse(raw)
    if (parsed) return parsed
  }

  for (let i = result.newItems.length - 1; i >= 0; i--) {
    const item = result.newItems[i]
    if (item.type !== 'tool_call_output_item') continue
    const raw = typeof item.output === 'string' ? item.output : JSON.stringify(item.output)
    const parsed = tryParse(raw)
    if (parsed) return parsed
  }

  const hint = typeof result.finalOutput === 'string' ? result.finalOutput : 'no tool output'
  throw new Error(`Media generation did not return a valid result. ${hint}`)
}

export type { MediaResult } from '@/types/media'

export interface GenerateMediaParams {
  postContent: string
  companyId: string
  channel: string
  refinementNote?: string
  brandColors?: { primary?: string; accent?: string }
  postId?: string
}

export async function generateMedia(params: GenerateMediaParams): Promise<MediaResult> {
  const { postContent, companyId, channel, refinementNote, brandColors, postId } = params

  const colorHint = brandColors?.primary
    ? `\nBrand colors: primary ${brandColors.primary}${brandColors.accent ? `, accent ${brandColors.accent}` : ''}`
    : ''

  const refinementHint = refinementNote ? `\nUser refinement request: "${refinementNote}"` : ''

  const prompt = `Create an image for this ${channel} post:

---
${postContent}
---
${colorHint}${refinementHint}

Call generate_image with a prompt that best matches the post — including infographic-style layouts when the content has data, steps, or comparisons.`

  const agent = buildMediaAgent(companyId, postId)
  const result = await run(agent, prompt)
  return parseMediaResult(result)
}
