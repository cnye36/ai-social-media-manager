/** Shared rules for blog cover/inline images. */

export const BLOG_IMAGE_HOOK_MAX_WORDS = 10

export const BLOG_IMAGE_THEME_RULES = `THEME COMPATIBILITY:
- The image must look excellent on BOTH light and dark blog page backgrounds
- If using a dark background: the image is self-contained and provides its own visual frame
- If using a light/white background: include a 2px border and subtle drop-shadow on the image edge so it has a clear boundary on dark-themed pages
- Never rely on the page color to "complete" the image — it must be self-contained`

export const BLOG_IMAGE_TEXT_OVERLAY_RULES = `BLOG COVER IMAGE STANDARDS — professional Canva/Figma designer quality:

STYLE: Structured graphic design — NOT a photograph, NOT abstract art. Looks like it was built by an experienced media creator.

BACKGROUND OPTIONS (any of these work):
- Dark: navy gradient, dark teal, deep charcoal — self-contained on any page
- Light: off-white, soft gray, warm cream — add 2px border + drop shadow for dark-theme compatibility
- NO pure black, NO pure white

HEADLINE (always the dominant element):
- Font: heavy bold sans-serif, 56–72px — the biggest text element in the composition
- On dark bg: white text with 1–2 gradient-colored keywords
- On light bg: near-black text with 1–2 vibrant-colored keywords
- Hook content: 5–8 punchy words (benefit, insight, or surprising claim) — NEVER the article title

VISUAL ELEMENTS (vary the placement and type per image):
- Diagrams, workflow charts, UI mockups, icon grids, stat cards, infographic panels
- Can appear on the right, left, center background, or scattered
- Use glows, borders, or frosted-glass effects to add polish

BENEFIT INDICATORS (vary placement):
- Can be a bottom strip, a top row, floating circles, a vertical sidebar list, or inline badges
- Each: icon + 2–3 word label

QUALITY BAR: Every image must look like it could be published on a professional tech or marketing blog today.`

/**
 * Full prompt for image generation: layout spec + exact hook text to render.
 */
export function formatBlogImagePrompt(visualDescription: string, hookText: string): string {
  const visual = visualDescription.trim()
  const hook = hookText.trim().replace(/^["']|["']$/g, '')
  if (!hook) return ensureBlogImagePromptHasHook(visual)

  return `${visual}

HEADLINE TEXT to render in the image: "${hook}"
${BLOG_IMAGE_TEXT_OVERLAY_RULES}`
}

/**
 * When no hook is provided, instruct the model to invent one from context.
 */
export function ensureBlogImagePromptHasHook(
  prompt: string,
  options?: { articleTitle?: string },
): string {
  const base = prompt.trim()
  const titleGuard = options?.articleTitle?.trim()
    ? `\n- Do NOT use the article title as the headline: "${options.articleTitle.trim()}"`
    : ''

  if (/HEADLINE TEXT|TEXT OVERLAY|hook text/i.test(base)) return base

  return `${base}

${BLOG_IMAGE_TEXT_OVERLAY_RULES}
- Invent a punchy 5–8 word benefit hook tied to the topic and render it as the dominant headline text.${titleGuard}`
}

const HOOK_PIPE_RE = /\|\s*HOOK:\s*["']?([^"'\n|]+?)["']?\s*$/i
const HOOK_INLINE_RE = /\bHOOK:\s*["']([^"']+)["']/i

export function parseImagePromptWithHook(raw: string): { visual: string; hook?: string } {
  const trimmed = raw.trim()
  const pipeMatch = trimmed.match(HOOK_PIPE_RE)
  if (pipeMatch) {
    const hook = pipeMatch[1].trim()
    const visual = trimmed.slice(0, pipeMatch.index).trim()
    return { visual, hook }
  }

  const inlineMatch = trimmed.match(HOOK_INLINE_RE)
  if (inlineMatch) {
    const hook = inlineMatch[1].trim()
    const visual = trimmed.replace(HOOK_INLINE_RE, '').trim()
    return { visual, hook }
  }

  return { visual: trimmed }
}

/** Normalize editor IMAGE_PROMPT comments or stored prompts for the image API. */
export function normalizeBlogImagePrompt(
  raw: string,
  options?: { articleTitle?: string },
): string {
  const { visual, hook } = parseImagePromptWithHook(raw)
  if (hook) return formatBlogImagePrompt(visual, hook)
  return ensureBlogImagePromptHasHook(visual, options)
}
