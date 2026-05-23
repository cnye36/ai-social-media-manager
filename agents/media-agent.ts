import { Agent, run, tool } from '@openai/agents'
import { z } from 'zod'
import { generateImage, normalizeImageSize, type ImageSize } from '@/lib/media/gpt-image'
import type { MediaResult } from '@/types/media'

const GenerateImageParams = z.object({
  prompt: z.string().describe(
    'Detailed image generation prompt. Specify style, mood, colors, composition. For infographics, diagrams, or charts: describe layout, headings, labels, icons, and data clearly so they render legibly in the image.'
  ),
  size: z
    .enum(['1024x1024', '1536x1024', '1024x1536'])
    .default('1536x1024')
    .describe(
      'Image dimensions. Use 1536x1024 for landscape (covers, most social), 1024x1536 for portrait, 1024x1024 for square inline visuals.'
    ),
})

function makeGenerateImageTool(companyId: string, linkIds: { postId?: string; articleId?: string }) {
  return tool({
    name: 'generate_image',
    description:
      'Generate an image with AI. Use for photography, illustrations, backgrounds, infographics, diagrams, charts, step-by-step visuals, stat cards, and comparison graphics — all as a single rendered image.',
    parameters: GenerateImageParams,
    execute: async (params) => {
      const result = await generateImage({ ...params, companyId, ...linkIds })
      return JSON.stringify({
        url: result.url,
        storagePath: result.storagePath,
        type: 'image',
        promptUsed: result.promptUsed,
      })
    },
  })
}

function buildMediaAgent(companyId: string, linkIds: { postId?: string; articleId?: string }, mode: 'social' | 'blog'): Agent {
  const socialInstructions = `You are a creative media specialist for social media content. Analyze the post and call generate_image once to create the perfect accompanying visual.

PROMPT QUALITY:
- Craft rich, specific prompts: style (photographic / illustrated / flat infographic), mood, lighting, palette, composition.
- Include "high quality, professional, social media optimized, legible text" when the visual needs labels or data.
- For statistics, processes, comparisons, or lists: describe an infographic-style layout (sections, headings, icons, numbers) so it renders clearly in one image.

BRAND COLORS:
- Default: violet primary (#7c3aed), soft accent (#a78bfa) when no brand colors are given.
- Apply brand colors from the user message when provided.

Call generate_image exactly once. Return only the tool result — no commentary.`

  const blogInstructions = `You are a creative media specialist for blog articles. Create a single high-quality image that matches the user's intent (cover hero or inline section visual).

PROMPT QUALITY:
- Blog covers: cinematic, editorial, wide composition (1536x1024), no cluttered text overlays unless requested.
- Inline section images: clear subject, supports the section topic, professional blog aesthetic.
- Infographics/diagrams: describe layout, labels, and hierarchy so text renders legibly.

BRAND COLORS:
- Default: violet primary (#7c3aed), soft accent (#a78bfa) when no brand colors are given.
- Apply brand colors from the user message when provided.

Call generate_image exactly once. Return only the tool result — no commentary.`

  return new Agent({
    name: 'MediaAgent',
    model: 'gpt-5.4',
    instructions: mode === 'blog' ? blogInstructions : socialInstructions,
    tools: [makeGenerateImageTool(companyId, linkIds)],
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
      if (parsed?.url && parsed?.storagePath && parsed?.type === 'image') {
        return {
          ...parsed,
          promptUsed: parsed.promptUsed ?? '',
        }
      }
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

export type MediaPurpose = 'cover' | 'inline' | 'social'

export interface GenerateMediaParams {
  postContent: string
  companyId: string
  channel?: string
  refinementNote?: string
  brandColors?: { primary?: string; accent?: string }
  postId?: string
  articleId?: string
  /** When set, skip the agent and generate with this exact prompt. */
  imagePrompt?: string
  purpose?: MediaPurpose
  size?: ImageSize
}

function defaultSize(purpose?: MediaPurpose): ImageSize {
  if (purpose === 'inline') return '1024x1024'
  return '1536x1024'
}

export async function generateMedia(params: GenerateMediaParams): Promise<MediaResult> {
  const {
    postContent,
    companyId,
    channel = 'blog',
    refinementNote,
    brandColors,
    postId,
    articleId,
    imagePrompt,
    purpose,
    size,
  } = params

  const linkIds = { postId, articleId }
  const apiSize = normalizeImageSize(size ?? defaultSize(purpose))

  if (imagePrompt?.trim()) {
    const result = await generateImage({
      prompt: imagePrompt.trim(),
      companyId,
      size: apiSize,
      ...linkIds,
    })
    return {
      type: 'image',
      url: result.url,
      storagePath: result.storagePath,
      promptUsed: result.promptUsed,
    }
  }

  const colorHint = brandColors?.primary
    ? `\nBrand colors: primary ${brandColors.primary}${brandColors.accent ? `, accent ${brandColors.accent}` : ''}`
    : ''

  const refinementHint = refinementNote ? `\nUser refinement request: "${refinementNote}"` : ''
  const purposeHint = purpose === 'cover'
    ? '\nPurpose: blog cover / hero image (wide editorial composition).'
    : purpose === 'inline'
      ? '\nPurpose: inline blog section illustration.'
      : ''

  const isBlog = channel === 'blog' || !!articleId
  const prompt = isBlog
    ? `Create an image for this blog article content:

---
${postContent}
---
${purposeHint}${colorHint}${refinementHint}

Call generate_image with size ${apiSize} and a prompt that best matches the content.`
    : `Create an image for this ${channel} post:

---
${postContent}
---
${colorHint}${refinementHint}

Call generate_image with a prompt that best matches the post — including infographic-style layouts when the content has data, steps, or comparisons.`

  const agent = buildMediaAgent(companyId, linkIds, isBlog ? 'blog' : 'social')
  const result = await run(agent, prompt)
  return parseMediaResult(result)
}
