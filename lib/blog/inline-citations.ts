/**
 * Moves markdown links that were dumped after the final sentence of a paragraph
 * into an inline parenthetical citation on that sentence.
 */
export function relocateTrailingCitationLinks(markdown: string): string {
  return markdown
    .split(/\n\n+/)
    .map(block => {
      const trimmed = block.trim()
      if (!trimmed || /^#{1,6}\s/.test(trimmed) || trimmed.startsWith('|') || trimmed.startsWith('>')) {
        return block
      }

      const match = trimmed.match(
        /^([\s\S]+?)([.!?])(["']?)\s+((?:\[[^\]]+\]\([^)\s]+\)\s*)+)$/,
      )
      if (!match) return block

      const [, body, punct, quote, linksPart] = match
      if (/\[[^\]]+\]\([^)\s]+\)/.test(body)) return block

      const links = [...linksPart.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)].map(m => `[${m[1]}](${m[2]})`)
      if (!links.length) return block

      const inline =
        links.length === 1
          ? ` (${links[0]})`
          : ` (${links.slice(0, -1).join(', ')}, and ${links[links.length - 1]})`

      return `${body.trimEnd()}${punct}${quote}${inline}`
    })
    .join('\n\n')
}
