/** Shared rules for blog cover/inline images — always include an integrated text hook. */

export const BLOG_IMAGE_HOOK_MAX_WORDS = 10

export const BLOG_IMAGE_THEME_RULES = `THEME COMPATIBILITY (required):
- The image must look excellent on both light and dark blog themes — do not rely on brand colors unless they naturally fit the scene.
- Use balanced palettes: editorial neutrals, natural tones, or mid-saturation accents; avoid huge pure-white or pure-black areas that clip in one theme.
- Hook typography needs a subtle plate, shadow, or scrim so text stays readable against varied page backgrounds.
- Brand colors are optional accents only — never force a purple/violet brand palette when another palette serves the concept better.`

export const BLOG_IMAGE_TEXT_OVERLAY_RULES = `MANDATORY TEXT OVERLAY (blog images):
- The image MUST include large, legible, professionally designed headline text baked into the composition — not a tiny caption or plain title bar.
- Text must be a short curiosity hook (4–10 words) that draws the eye and ties to the article — NEVER paste the article title verbatim.
- Typography must work with the visual: strong contrast, safe margins, complementary palette, subtle shadow/backdrop/plate so text stays readable.
- Place text where it balances the layout (often lower-third or opposite the main subject), not covering the focal point.

${BLOG_IMAGE_THEME_RULES}`

/**
 * Full prompt for image generation: visual scene + exact hook text to render.
 */
export function formatBlogImagePrompt(visualDescription: string, hookText: string): string {
  const visual = visualDescription.trim()
  const hook = hookText.trim().replace(/^["']|["']$/g, '')
  if (!hook) return ensureBlogImagePromptHasHook(visual)

  return `${visual}

REQUIRED TEXT OVERLAY — render this exact hook in large, bold, editorial typography integrated with the image: "${hook}"
${BLOG_IMAGE_TEXT_OVERLAY_RULES}`
}

/**
 * When no hook is provided, instruct the model to invent one from context (never the title).
 */
export function ensureBlogImagePromptHasHook(
  prompt: string,
  options?: { articleTitle?: string },
): string {
  const base = prompt.trim()
  const titleGuard = options?.articleTitle?.trim()
    ? `\n- Do NOT use this article title as the overlay text: "${options.articleTitle.trim()}"`
    : ''

  if (/REQUIRED TEXT OVERLAY|TEXT OVERLAY|hook text/i.test(base)) return base

  return `${base}

${BLOG_IMAGE_TEXT_OVERLAY_RULES}
- Invent a specific 4–10 word curiosity hook tied to the article topic and render it prominently in the image.${titleGuard}`
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
