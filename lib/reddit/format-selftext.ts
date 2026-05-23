/**
 * Parse Reddit RSS / legacy HTML selftext into readable blocks for UI (and plain text for storage).
 */

export type InlineSegment =
  | { type: 'text'; text: string }
  | { type: 'link'; text: string; href: string }

export type RedditSelftextBlock =
  | { type: 'paragraph'; segments: InlineSegment[] }
  | { type: 'list-item'; segments: InlineSegment[] }

const ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&(\w+);/g, (_, name) => ENTITY_MAP[name.toLowerCase()] ?? `&${name};`)
}

/** Strip Reddit RSS boilerplate (SC_* comments, "submitted by…" footer). */
export function stripRedditBoilerplate(raw: string): string {
  return raw
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s*submitted\s+by\s+[\s\S]*$/i, '')
    .trim()
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

function parseInlineHtml(fragment: string): InlineSegment[] {
  const decoded = decodeHtmlEntities(fragment)
  const segments: InlineSegment[] = []
  const linkRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = linkRe.exec(decoded)) !== null) {
    const before = decoded.slice(lastIndex, match.index)
    const textBefore = normalizeWhitespace(before.replace(/<[^>]+>/g, ''))
    if (textBefore) segments.push({ type: 'text', text: textBefore })

    const href = match[1].trim()
    const linkText = normalizeWhitespace(match[2].replace(/<[^>]+>/g, ''))
    if (linkText) segments.push({ type: 'link', text: linkText, href })

    lastIndex = match.index + match[0].length
  }

  const tail = normalizeWhitespace(decoded.slice(lastIndex).replace(/<[^>]+>/g, ''))
  if (tail) segments.push({ type: 'text', text: tail })

  if (!segments.length && decoded.replace(/<[^>]+>/g, '').trim()) {
    const plain = normalizeWhitespace(decoded.replace(/<[^>]+>/g, ''))
    if (plain) segments.push({ type: 'text', text: plain })
  }

  return segments
}

function segmentsFromPlain(text: string): InlineSegment[] {
  const t = text.trim()
  return t ? [{ type: 'text', text: t }] : []
}

function pushParagraph(blocks: RedditSelftextBlock[], segments: InlineSegment[]) {
  if (!segments.length) return
  blocks.push({ type: 'paragraph', segments })
}

function pushListItem(blocks: RedditSelftextBlock[], segments: InlineSegment[]) {
  if (!segments.length) return
  blocks.push({ type: 'list-item', segments })
}

/** Reddit RSS HTML or plain selftext → structured blocks for rendering. */
export function parseRedditSelftext(raw: string): { blocks: RedditSelftextBlock[] } {
  const cleaned = stripRedditBoilerplate(raw ?? '')
  if (!cleaned) return { blocks: [] }

  const blocks: RedditSelftextBlock[] = []
  const hasHtml = /<[a-z][\s\S]*>/i.test(cleaned)

  if (!hasHtml) {
    for (const para of cleaned.split(/\n{2,}/)) {
      pushParagraph(blocks, segmentsFromPlain(para.replace(/\n/g, ' ')))
    }
    return { blocks }
  }

  let html = cleaned
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/li>/gi, '</li>\n')

  const listItemRe = /<li[^>]*>([\s\S]*?)<\/li>/gi
  let liMatch: RegExpExecArray | null
  const listItems: string[] = []
  while ((liMatch = listItemRe.exec(html)) !== null) {
    listItems.push(liMatch[1])
  }
  if (listItems.length) {
    html = html.replace(/<ul[^>]*>[\s\S]*?<\/ul>/gi, '')
    html = html.replace(/<ol[^>]*>[\s\S]*?<\/ol>/gi, '')
    for (const item of listItems) {
      pushListItem(blocks, parseInlineHtml(item))
    }
  }

  const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi
  let pMatch: RegExpExecArray | null
  let foundParagraphs = false
  while ((pMatch = pRe.exec(html)) !== null) {
    foundParagraphs = true
    pushParagraph(blocks, parseInlineHtml(pMatch[1]))
  }

  if (!foundParagraphs) {
    const mdInner = html.match(/<div[^>]*class=["'][^"']*md[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]
    const source = mdInner ?? html.replace(/<div[^>]*>/gi, '\n').replace(/<\/div>/gi, '\n')
    const chunks = source
      .split(/\n+/)
      .map(c => c.trim())
      .filter(c => c && !/^<[^>]+>$/.test(c))

    if (chunks.length) {
      for (const chunk of chunks) {
        pushParagraph(blocks, parseInlineHtml(chunk))
      }
    } else {
      pushParagraph(blocks, parseInlineHtml(html))
    }
  }

  return { blocks }
}

/** Plain text suitable for DB storage and AI prompts. */
export function redditSelftextToPlain(raw: string): string {
  const { blocks } = parseRedditSelftext(raw)
  return blocks
    .map(block => {
      const line = block.segments
        .map(s => (s.type === 'link' ? `${s.text} (${s.href})` : s.text))
        .join('')
      return block.type === 'list-item' ? `• ${line}` : line
    })
    .filter(Boolean)
    .join('\n\n')
}
