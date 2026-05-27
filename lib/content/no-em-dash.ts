/** Core instruction (no leading bullet) for embedding in prompt lists. */
export const NO_EM_DASH_INSTRUCTION =
  'Never use em dashes (—) anywhere in your output: titles, headings, body, hashtags, hooks, or meta fields. Zero tolerance — they read as AI-generated. Use a comma, period, colon, parentheses, or rewrite the sentence instead.'

/** Bullet form for markdown-style rule lists. */
export const NO_EM_DASH_RULE = `- ${NO_EM_DASH_INSTRUCTION}`

/** Remove em dashes from model output (safety net after generation). */
export function stripEmDashes(text: string): string {
  return text.replace(/\s*—\s*/g, ', ').replace(/—/g, ', ')
}
