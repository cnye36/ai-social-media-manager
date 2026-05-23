const IMAGE_PROMPT_MARKER = '<!-- IMAGE_PROMPT:'

/** Extract inline image prompt suggestions from article markdown. */
export function extractImagePrompts(markdown: string): string[] {
  const prompts: string[] = []
  for (const line of markdown.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith(IMAGE_PROMPT_MARKER)) continue
    const end = trimmed.indexOf('-->')
    const inner = end > 0
      ? trimmed.slice(IMAGE_PROMPT_MARKER.length, end).trim()
      : trimmed.slice(IMAGE_PROMPT_MARKER.length).trim()
    if (inner) prompts.push(inner)
  }
  return prompts
}

/** Nearest IMAGE_PROMPT comment before a character offset (for section-aware generation). */
export function imagePromptBeforeOffset(markdown: string, offset: number): string | undefined {
  const before = markdown.slice(0, Math.max(0, offset))
  const lines = before.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim()
    if (!trimmed.startsWith(IMAGE_PROMPT_MARKER)) continue
    const end = trimmed.indexOf('-->')
    return end > 0
      ? trimmed.slice(IMAGE_PROMPT_MARKER.length, end).trim()
      : trimmed.slice(IMAGE_PROMPT_MARKER.length).trim()
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
