/** Suffix markers the content agent may append after the post body (legacy). */
const IMAGE_PROMPT_MARKERS = [
  '\n--\nIMAGE_PROMPT:',
  '\n---\nIMAGE_PROMPT:',
  '\n--\n\nIMAGE_PROMPT:',
  '\n\n--\nIMAGE_PROMPT:',
] as const

/** Matches `--` / `---` separator and optional IMAGE_PROMPT block at end of text. */
const TRAILING_IMAGE_BLOCK_RE = /\n-{2,3}\s*(\n\s*IMAGE_PROMPT:\s*[\s\S]*)?$/i

const IMAGE_PROMPT_ONLY_RE = /\n\s*IMAGE_PROMPT:\s*([\s\S]*)$/i

/**
 * Split post body from an appended image prompt (if present).
 * Use for display, save, and publish — never ship the prompt with the post.
 */
export function splitImagePromptFromText(text: string): { content: string; imagePrompt?: string } {
  if (!text) return { content: '' }

  let earliest = -1
  let markerLen = 0
  for (const marker of IMAGE_PROMPT_MARKERS) {
    const idx = text.indexOf(marker)
    if (idx !== -1 && (earliest === -1 || idx < earliest)) {
      earliest = idx
      markerLen = marker.length
    }
  }

  if (earliest !== -1) {
    return {
      content: text.slice(0, earliest).trimEnd(),
      imagePrompt: text.slice(earliest + markerLen).trim() || undefined,
    }
  }

  const onlyMatch = IMAGE_PROMPT_ONLY_RE.exec(text)
  if (onlyMatch?.index !== undefined) {
    return {
      content: text.slice(0, onlyMatch.index).trimEnd(),
      imagePrompt: onlyMatch[1].trim() || undefined,
    }
  }

  const trailing = TRAILING_IMAGE_BLOCK_RE.exec(text)
  if (trailing?.index !== undefined) {
    const block = trailing[0]
    const promptMatch = /IMAGE_PROMPT:\s*([\s\S]*)$/i.exec(block)
    return {
      content: text.slice(0, trailing.index).trimEnd(),
      ...(promptMatch?.[1]?.trim() ? { imagePrompt: promptMatch[1].trim() } : {}),
    }
  }

  return { content: text.trimEnd() }
}

/** Post text safe for UI while streaming (hides partial `--` / IMAGE_PROMPT suffix). */
export function postBodyForDisplay(text: string): string {
  return splitImagePromptFromText(text).content
}

/** Post text safe to publish or copy — strips any image-prompt suffix. */
export function postBodyForPublish(text: string): string {
  return splitImagePromptFromText(text).content
}
