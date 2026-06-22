import { Agent, run, tool } from '@openai/agents'
import { z } from 'zod'
import {
  BLOG_IMAGE_TEXT_OVERLAY_RULES,
  BLOG_IMAGE_THEME_RULES,
  normalizeBlogImagePrompt,
} from '@/lib/blog/image-hooks'
import { BLOG_COVER_IMAGE_SIZE, BLOG_INLINE_IMAGE_SIZE } from '@/lib/blog/image-sizes'
import { generateImageAltText } from '@/lib/media/alt-text'
import { generateImage, normalizeImageSize, updateMediaLibraryAlt, type ImageSize } from '@/lib/media/gpt-image'
import type { MediaResult } from '@/types/media'

const GenerateImageParams = z.object({
  prompt: z.string().describe(
    'Detailed image generation prompt: visual scene plus exact on-image hook text to render. For blog: include large legible headline hook (4–10 words, not the article title) integrated with the composition. For infographics: describe layout, labels, and hook typography so text renders legibly.'
  ),
  size: z
    .enum(['1024x1024', '1536x1024', '1024x1536', '1792x1024', '1024x1792'])
    .default('1536x1024')
    .describe(
      'Image dimensions. Use 1792x1024 for blog cover heroes (16:9), 1536x1024 for social landscape, 1024x1536 for portrait, 1024x1024 for square inline visuals.'
    ),
})

function makeGenerateImageTool(companyId: string, linkIds: { postId?: string; articleId?: string }, logoUrl?: string | null) {
  return tool({
    name: 'generate_image',
    description:
      'Generate an image with AI. Use for photography, illustrations, backgrounds, infographics, diagrams, charts, step-by-step visuals, stat cards, and comparison graphics — all as a single rendered image.',
    parameters: GenerateImageParams,
    execute: async (params) => {
      const result = await generateImage({ ...params, companyId, ...linkIds, logoUrl })
      return JSON.stringify({
        url: result.url,
        storagePath: result.storagePath,
        type: 'image',
        promptUsed: result.promptUsed,
      })
    },
  })
}

function buildMediaAgent(companyId: string, linkIds: { postId?: string; articleId?: string }, mode: 'social' | 'blog', logoUrl?: string | null): Agent {
  const socialInstructions = `You are a creative media specialist for social media content. Analyze the post and call generate_image once to create the perfect accompanying visual.

PROMPT QUALITY:
- Craft rich, specific prompts: style (photographic / illustrated / flat infographic), mood, lighting, palette, composition.
- Include "high quality, professional, social media optimized, legible text" when the visual needs labels or data.
- For statistics, processes, comparisons, or lists: describe an infographic-style layout (sections, headings, icons, numbers) so it renders clearly in one image.

BRAND COLORS:
- Default: violet primary (#7c3aed), soft accent (#a78bfa) when no brand colors are given.
- Apply brand colors from the user message when provided.

Call generate_image exactly once. Return only the tool result — no commentary.`

  const blogInstructions = `You are a senior graphic designer who creates high-performing blog cover images — the kind a media expert builds in Canva or Figma. Every image you create looks distinctly different from the last.

${BLOG_IMAGE_TEXT_OVERLAY_RULES}

DESIGN VARIETY (critical — do NOT always use the same layout):
You have full creative freedom over:
- Background: dark (navy, charcoal, teal) OR light (cream, off-white, soft gray) — alternate between them
- Headline placement: left-aligned, center, or bottom-anchored
- Visual element position: right side, left side, background, or scattered floating cards
- Benefit indicators: bottom strip, top row, floating circles, vertical sidebar, or inline chips
- Overall feel: structured split, editorial magazine, cinematic overlay, scattered cards, typographic minimalist

The ONLY constants:
1. Looks like professional Canva/Figma design (not a photo, not abstract art)
2. Headline hook is 5–8 punchy words — never the article title
3. Must look great on both light and dark blog themes
4. Text is always large, bold, and crisp — the dominant visual element

For inline section images: simpler composition matching the cover's aesthetic — no bottom strip needed.

SIZE: Always use ${BLOG_COVER_IMAGE_SIZE} for covers.

Call generate_image exactly once. Return only the tool result — no commentary.`

  return new Agent({
    name: 'MediaAgent',
    model: 'gpt-5.4',
    instructions: mode === 'blog' ? blogInstructions : socialInstructions,
    tools: [makeGenerateImageTool(companyId, linkIds, logoUrl)],
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
  /** Public URL of the company's real logo — when set, it's composited into the image. */
  logoUrl?: string | null
}

function defaultSize(purpose?: MediaPurpose): ImageSize {
  if (purpose === 'inline') return BLOG_INLINE_IMAGE_SIZE
  if (purpose === 'cover') return BLOG_COVER_IMAGE_SIZE
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
    logoUrl,
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
      logoUrl,
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
    ? `Create a professional blog cover image for this article content.

---
${postContent.slice(0, 1200)}
---
${articleTitle ? `Article title (do NOT use verbatim as on-image headline): "${articleTitle}"\n` : ''}${purposeHint}${blogThemeHint}${refinementHint}

Follow the Canva/Figma infographic design style in your instructions exactly:
- Dark gradient background
- Bold left-aligned headline with gradient accent keywords (5–8 word punchy hook, NOT the article title)
- Right-side visual element (workflow diagram, UI mockup, or icon grid) relevant to the article topic  
- Bottom benefit strip with 3–4 icon + label badges
- Optional topic category pill badge top-left

Call generate_image with size ${apiSize}.`
    : `Create an image for this ${channel} post:

---
${postContent}
---
${colorHint}${refinementHint}

Call generate_image with a prompt that best matches the post — including infographic-style layouts when the content has data, steps, or comparisons.`

  const agent = buildMediaAgent(companyId, linkIds, isBlog ? 'blog' : 'social', logoUrl)
  const result = await run(agent, prompt)
  const image = parseMediaResult(result)
  return attachAltText(image, { postContent: postContent.trim(), channel, purpose })
}
