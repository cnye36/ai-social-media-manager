import { Agent, run, tool } from '@openai/agents'
import { z } from 'zod'
import {
  BLOG_IMAGE_TEXT_OVERLAY_RULES,
  BLOG_IMAGE_THEME_RULES,
  normalizeBlogImagePrompt,
} from '@/lib/blog/image-hooks'
import { generateImageAltText } from '@/lib/media/alt-text'
import { generateImage, normalizeImageSize, updateMediaLibraryAlt, type ImageSize } from '@/lib/media/gpt-image'
import type { MediaResult } from '@/types/media'

const GenerateImageParams = z.object({
  prompt: z.string().describe(
    'Detailed image generation prompt: visual scene plus exact on-image hook text to render. For blog: include large legible headline hook (4–10 words, not the article title) integrated with the composition. For infographics: describe layout, labels, and hook typography so text renders legibly.'
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

  const blogInstructions = `You are a creative media specialist for blog articles. Create a single high-quality image with an integrated text hook.

${BLOG_IMAGE_TEXT_OVERLAY_RULES}

PROMPT QUALITY:
- Always call generate_image with a prompt that specifies BOTH the visual scene AND the exact hook text to render.
- Invent a 4–10 word curiosity hook from the article content — never use the article title as the overlay.
- Blog covers: cinematic, editorial, wide composition (1536x1024); place hook text in lower-third or opposite the focal subject.
- Inline section images: hook should name that section's insight or surprise; clear subject, professional blog aesthetic.
- Infographics/diagrams: hook + diagram labels must both be legible; describe layout and typography.

${BLOG_IMAGE_THEME_RULES}

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

function parseMediaResult(result: AgentRunResult): Omit<MediaResult, 'altText'> {
  const tryParse = (raw: string): Omit<MediaResult, 'altText'> | null => {
    try {
      const parsed = JSON.parse(raw) as MediaResult
      if (parsed?.url && parsed?.storagePath && parsed?.type === 'image') {
        return {
          type: 'image',
          url: parsed.url,
          storagePath: parsed.storagePath,
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
  /** Used to forbid using the title verbatim as on-image hook text. */
  articleTitle?: string
}

function defaultSize(purpose?: MediaPurpose): ImageSize {
  if (purpose === 'inline') return '1024x1024'
  return '1536x1024'
}

async function attachAltText(
  result: Omit<MediaResult, 'altText'>,
  context: {
    postContent: string
    channel?: string
    purpose?: MediaPurpose
  },
): Promise<MediaResult> {
  const altText = await generateImageAltText({
    promptUsed: result.promptUsed,
    postContent: context.postContent,
    channel: context.channel,
    purpose: context.purpose,
  })
  void updateMediaLibraryAlt(result.storagePath, altText)
  return { ...result, altText }
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
    articleTitle,
  } = params

  const linkIds = { postId, articleId }
  const apiSize = normalizeImageSize(size ?? defaultSize(purpose))
  const isBlog = channel === 'blog' || !!articleId

  if (imagePrompt?.trim()) {
    const prompt = isBlog
      ? normalizeBlogImagePrompt(imagePrompt.trim(), { articleTitle })
      : imagePrompt.trim()
    const image = await generateImage({
      prompt,
      companyId,
      size: apiSize,
      ...linkIds,
    })
    return attachAltText(
      {
        type: 'image',
        url: image.url,
        storagePath: image.storagePath,
        promptUsed: image.promptUsed,
      },
      { postContent: postContent.trim(), channel, purpose },
    )
  }

  const colorHint =
    !isBlog && brandColors?.primary
      ? `\nBrand colors: primary ${brandColors.primary}${brandColors.accent ? `, accent ${brandColors.accent}` : ''}`
      : ''

  const blogThemeHint = isBlog
    ? `\n${BLOG_IMAGE_THEME_RULES}${
        brandColors?.primary
          ? `\nOptional brand accent (use sparingly, only if it fits): ${brandColors.primary}${brandColors.accent ? `, ${brandColors.accent}` : ''}`
          : ''
      }`
    : ''

  const refinementHint = refinementNote ? `\nUser refinement request: "${refinementNote}"` : ''
  const purposeHint = purpose === 'cover'
    ? '\nPurpose: blog cover / hero image (wide editorial composition).'
    : purpose === 'inline'
      ? '\nPurpose: inline blog section illustration.'
      : ''

  const prompt = isBlog
    ? `Create an image for this blog article content:

---
${postContent}
---
${articleTitle ? `Article title (do NOT use as on-image text): "${articleTitle}"\n` : ''}${purposeHint}${blogThemeHint}${refinementHint}

Call generate_image with size ${apiSize}. Your prompt MUST include a specific visual scene AND a 4–10 word curiosity hook rendered as large integrated typography (not the article title).`
    : `Create an image for this ${channel} post:

---
${postContent}
---
${colorHint}${refinementHint}

Call generate_image with a prompt that best matches the post — including infographic-style layouts when the content has data, steps, or comparisons.`

  const agent = buildMediaAgent(companyId, linkIds, isBlog ? 'blog' : 'social')
  const result = await run(agent, prompt)
  const image = parseMediaResult(result)
  return attachAltText(image, { postContent: postContent.trim(), channel, purpose })
}
