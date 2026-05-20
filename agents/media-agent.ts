import { Agent, run, tool } from '@openai/agents'
import { z } from 'zod'
import { generateImage } from '@/lib/media/gpt-image'
import { renderAndStoreInfographic, type InfographicSpec } from '@/lib/media/infographic'

// ── Tool schemas ───────────────────────────────────────────────────────────────

const GenerateImageParams = z.object({
  prompt: z.string().describe('Detailed image generation prompt. Be specific about style, mood, colors, composition.'),
  size: z.enum(['1024x1024', '1536x1024', '1024x1536']).default('1536x1024').describe('Image dimensions. Use 1536x1024 for landscape (most social posts), 1024x1536 for portrait (Stories/Reels), 1024x1024 for square.'),
})

const InfographicItemSchema = z.object({
  label: z.string(),
  value: z.string().optional(),
  description: z.string().optional(),
  left: z.string().optional(),
  right: z.string().optional(),
})

const CreateInfographicParams = z.object({
  layout: z.enum(['stats', 'steps', 'list', 'comparison']).describe(
    'stats: metric cards with big numbers. steps: numbered process flow. list: 2-column feature/tip cards. comparison: before/after or two-option contrast.'
  ),
  title: z.string().describe('Main heading of the infographic (keep under 60 chars)'),
  subtitle: z.string().optional().describe('Short supporting subtitle'),
  items: z.array(InfographicItemSchema).min(2).max(8),
  primaryColor: z.string().optional().describe('Hex color for primary accents, e.g. #7c3aed'),
  accentColor: z.string().optional().describe('Hex color for gradient accent, e.g. #a78bfa'),
})

// ── Tool implementations ───────────────────────────────────────────────────────

function makeGenerateImageTool(companyId: string, postId?: string) {
  return tool({
    name: 'generate_image',
    description: 'Generate a photorealistic or stylized image using AI. Best for: hero images, product shots, lifestyle/scene photography, abstract backgrounds, illustrated concepts.',
    parameters: GenerateImageParams,
    execute: async (params) => {
      const result = await generateImage({ ...params, companyId, postId })
      return JSON.stringify({ url: result.url, storagePath: result.storagePath, type: 'image' })
    },
  })
}

function makeCreateInfographicTool(companyId: string, postId?: string) {
  return tool({
    name: 'create_infographic',
    description: 'Generate a branded infographic card as SVG. Best for: statistics, step-by-step guides, feature lists, comparison tables, data visualizations.',
    parameters: CreateInfographicParams,
    execute: async (params) => {
      const spec: InfographicSpec = params
      const result = await renderAndStoreInfographic(spec, companyId, postId)
      return JSON.stringify({ url: result.url, storagePath: result.storagePath, svg: result.svg, type: 'infographic' })
    },
  })
}

// ── Agent factory ──────────────────────────────────────────────────────────────

function buildMediaAgent(companyId: string, postId?: string): Agent {
  return new Agent({
    name: 'MediaAgent',
    model: 'gpt-5.4',
    instructions: `You are a creative media specialist for social media content. Your job is to analyze a social media post and create the perfect accompanying visual.

DECISION FRAMEWORK:
- Choose generate_image when the post would benefit from a photorealistic scene, lifestyle image, product visualization, or atmospheric backdrop
- Choose create_infographic when the post contains statistics, processes, comparisons, lists, or structured data that benefits from a visual layout

QUALITY STANDARDS:
- For images: craft rich, detailed prompts that specify style (photographic/illustrated/abstract), mood, lighting, color palette, and composition. Include "high quality, professional, social media optimized" in prompts.
- For infographics: extract concrete data points or steps from the post content. Keep labels concise. Use the post's tone to guide layout choice.

COLORS:
- Default primary: #7c3aed (violet), accent: #a78bfa (soft violet)
- If the post mentions brand colors or the company uses specific colors, apply them

Always call exactly one tool. Return only the tool result — do not add commentary.`,
    tools: [
      makeGenerateImageTool(companyId, postId),
      makeCreateInfographicTool(companyId, postId),
    ],
  })
}

// ── Result parsing ─────────────────────────────────────────────────────────────

type AgentRunResult = {
  finalOutput?: unknown
  newItems: Array<{ type: string; output?: unknown }>
}

function parseMediaResult(result: AgentRunResult): MediaResult {
  const tryParse = (raw: string): MediaResult | null => {
    try {
      return JSON.parse(raw) as MediaResult
    } catch {
      return null
    }
  }

  if (result.finalOutput) {
    const raw = typeof result.finalOutput === 'string'
      ? result.finalOutput
      : JSON.stringify(result.finalOutput)
    const parsed = tryParse(raw)
    if (parsed?.url && parsed?.storagePath && parsed?.type) return parsed
  }

  for (let i = result.newItems.length - 1; i >= 0; i--) {
    const item = result.newItems[i]
    if (item.type !== 'tool_call_output_item') continue
    const raw = typeof item.output === 'string' ? item.output : JSON.stringify(item.output)
    const parsed = tryParse(raw)
    if (parsed?.url && parsed?.storagePath && parsed?.type) return parsed
  }

  const hint = typeof result.finalOutput === 'string' ? result.finalOutput : 'no tool output'
  throw new Error(`Media generation did not return a valid result. ${hint}`)
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface MediaResult {
  type: 'image' | 'infographic'
  url: string
  storagePath: string
  svg?: string
}

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

  const refinementHint = refinementNote
    ? `\nUser refinement request: "${refinementNote}"`
    : ''

  const prompt = `Create visual media for this ${channel} post:

---
${postContent}
---
${colorHint}${refinementHint}

Analyze the post and call the appropriate tool (generate_image or create_infographic) to produce the best visual.`

  const agent = buildMediaAgent(companyId, postId)
  const result = await run(agent, prompt)
  return parseMediaResult(result)
}
