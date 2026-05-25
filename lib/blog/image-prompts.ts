import { normalizeBlogImagePrompt } from '@/lib/blog/image-hooks'

const IMAGE_PROMPT_MARKER = '<!-- IMAGE_PROMPT:'

function parsePromptLine(trimmed: string): string | undefined {
  if (!trimmed.startsWith(IMAGE_PROMPT_MARKER)) return undefined
  const end = trimmed.indexOf('-->')
  const inner = end > 0
    ? trimmed.slice(IMAGE_PROMPT_MARKER.length, end).trim()
    : trimmed.slice(IMAGE_PROMPT_MARKER.length).trim()
  return inner || undefined
}

/** Extract inline image prompt suggestions from article markdown (with hook overlay rules applied). */
export function extractImagePrompts(markdown: string, options?: { articleTitle?: string }): string[] {
  const prompts: string[] = []
  for (const line of markdown.split('\n')) {
    const inner = parsePromptLine(line.trim())
    if (inner) prompts.push(normalizeBlogImagePrompt(inner, options))
  }
  return prompts
}

/** Nearest IMAGE_PROMPT comment before a character offset (for section-aware generation). */
export function imagePromptBeforeOffset(
  markdown: string,
  offset: number,
  options?: { articleTitle?: string },
): string | undefined {
  const before = markdown.slice(0, Math.max(0, offset))
  const lines = before.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const inner = parsePromptLine(lines[i].trim())
    if (inner) return normalizeBlogImagePrompt(inner, options)
  }
  return undefined
}

/** Strip editor-only image prompt comments from exported MDX. */
export function stripImagePromptComments(markdown: string): string {
  return markdown
    .split('\n')
    .filter(line => !line.trim().startsWith(IMAGE_PROMPT_MARKER))
    .join('\n')
}
