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
import type { Channel } from '@/types/database'

const GenerateImageParams = z.object({
  prompt: z.string().describe(
    'Detailed image generation prompt: visual scene plus exact on-image hook text to render. For blog: include large legible headline hook (4–10 words, not the article title) integrated with the composition. For infographics: describe layout, labels, and hook typography so text renders legibly.'
  ),
  size: z
    .enum(['1024x1024', '1536x1024', '1024x1536', '1792x1024', '1024x1792'])
    .default('1536x1024')
    .describe(
      'Image dimensions. Use 1536x1024 for blog cover heroes (3:2) and social landscape, 1024x1536 for portrait, 1024x1024 for square inline visuals.'
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

const SOCIAL_IMAGE_INTRO = `You are a creative media specialist for social media content. Analyze the post and call generate_image once to create the perfect accompanying visual.

PROMPT QUALITY:
- Craft rich, specific prompts: exact layout, mood, lighting, palette, composition, and the exact text/labels/numbers to render.
- Include "high quality, professional, legible text" whenever the visual carries labels or data.

BRAND COLORS:
- Default: violet primary (#7c3aed), soft accent (#a78bfa) when no brand colors are given.
- Apply brand colors from the user message when provided.`

const LINKEDIN_IMAGE_RULES = `STYLE: Structured information design — a data card, stat breakout, before/after comparison panel, or a 3-5 step mini-diagram. NOT a stock photo, NOT a generic corporate scene (handshakes, laptop-and-coffee, meeting room), NOT decorative art with no informational payload. Think "slide pulled from a sharp internal deck," not "marketing banner."

WHAT TO BUILD (pick whichever fits the post's actual content):
- A single bold stat or number as the hero element, with 1-2 lines of supporting context
- A before/after or X-vs-Y comparison (two columns or two states)
- A 3-5 step process or framework diagram
- A short "the N things that mattered" checklist card

LAYOUT:
- One dominant headline, number, or label — heavy bold sans-serif, the largest element in the frame
- Legible at feed-thumbnail size: 2-4 content blocks max, generous whitespace, no dense paragraphs or fine print
- Background: solid or subtle gradient (navy, charcoal, off-white, soft gray) — never a busy photo background

WHAT TO AVOID: stock photography, generic corporate scenes, clip-art icons, more than 4 pieces of text/data, purely decorative visuals with nothing to actually read.

QUALITY BAR: someone scrolling past should be able to tell from the thumbnail alone that there's a real insight inside — enough to make them want to click "see more."`

const X_IMAGE_RULES = `STYLE: One sharp, single-focus visual — a chart, a before/after, a bold stat callout, or a screenshot-style mockup. NOT a stock photo, NOT decorative art, NOT a dense multi-panel infographic (the tweet already carries the words; this is a fast-scrolling feed).

LAYOUT: One clear focal point, minimal text — the image should add one visual proof point (a number, a trend line, a stark contrast), not restate the tweet.

WHAT TO AVOID: stock photography, corporate clip-art, cramming multiple data points into one image.`

const FACEBOOK_IMAGE_RULES = `STYLE: Warm and authentic — a candid-feeling photo-style scene, a simple relatable illustration, or a milestone/celebration visual. NOT a corporate infographic, NOT a stiff stock-photo boardroom scene.

LAYOUT: Simple and readable at a glance — this is a fast-scroll platform, not a place for dense data panels or heavy text overlays.

WHAT TO AVOID: dense text/data overlays, corporate stock photography, anything that looks like a paid ad unit.`

const REDDIT_IMAGE_RULES = `STYLE: Plain and native-feeling — a simple screenshot-style mockup, a real-looking photo, or a bare-bones chart. Reddit users downvote anything that looks like a polished marketing graphic or ad.

LAYOUT: Minimal to no text overlay. If data needs showing, render it like a quick screenshot or hand-drawn chart, not a designed infographic.

WHAT TO AVOID: polished corporate design, gradients, icon grids, benefit strips, anything that reads as "made by a marketing team."`

const SOCIAL_CHANNEL_IMAGE_RULES: Partial<Record<Channel, string>> = {
  linkedin: LINKEDIN_IMAGE_RULES,
  x: X_IMAGE_RULES,
  facebook: FACEBOOK_IMAGE_RULES,
  reddit: REDDIT_IMAGE_RULES,
}

function buildSocialInstructions(channel: Channel): string {
  const channelRules = SOCIAL_CHANNEL_IMAGE_RULES[channel] ?? LINKEDIN_IMAGE_RULES
  return `${SOCIAL_IMAGE_INTRO}\n\n${channelRules}\n\nCall generate_image exactly once. Return only the tool result — no commentary.`
}

function buildMediaAgent(companyId: string, linkIds: { postId?: string; articleId?: string }, mode: 'blog' | Channel, logoUrl?: string | null): Agent {
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
    instructions: mode === 'blog' ? blogInstructions : buildSocialInstructions(mode),
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

  const agent = buildMediaAgent(companyId, linkIds, isBlog ? 'blog' : (channel as Channel), logoUrl)
  const result = await run(agent, prompt)
  const image = parseMediaResult(result)
  return attachAltText(image, { postContent: postContent.trim(), channel, purpose })
}
