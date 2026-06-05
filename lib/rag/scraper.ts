import * as cheerio from 'cheerio'

export interface ScrapedPage {
  url: string
  title: string
  content: string
}

const MAX_PAGES = 30
const SKIP_EXTENSIONS = /\.(pdf|jpg|jpeg|png|gif|svg|css|js|ico|woff|woff2|ttf|zip|mp4|mp3)$/i
const SKIP_PATTERNS = /\/(tag|category|author|feed|wp-json|wp-admin|cdn-cgi)/i

function normalizeUrl(href: string, base: string): string | null {
  try {
    const url = new URL(href, base)
    url.hash = ''
    url.search = ''
    return url.href
  } catch {
    return null
  }
}

function extractText($: ReturnType<typeof cheerio.load>): string {
  // Remove noisy elements
  $('script, style, nav, footer, header, aside, form, iframe, noscript, [aria-hidden="true"]').remove()
  $('[class*="cookie"], [class*="popup"], [class*="modal"], [id*="cookie"]').remove()

  // Prefer semantic main content
  const main =
    $('main').text() ||
    $('article').text() ||
    $('[role="main"]').text() ||
    $('body').text()

  return main
    .replace(/\s+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function extractLinks($: ReturnType<typeof cheerio.load>, baseUrl: string, origin: string): string[] {
  const links: string[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $('a[href]').each((_i: number, el: any) => {
    const href = $(el).attr('href')
    if (!href) return
    const normalized = normalizeUrl(href, baseUrl)
    if (!normalized) return
    if (!normalized.startsWith(origin)) return
    if (SKIP_EXTENSIONS.test(normalized)) return
    if (SKIP_PATTERNS.test(normalized)) return
    links.push(normalized)
  })
  return [...new Set(links)]
}

async function fetchPage(url: string): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'SocialAI-Bot/1.0 (content indexer)' },
      signal: AbortSignal.timeout(10000),
      redirect: 'follow',
    })
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html')) return null
    return { html: await res.text(), finalUrl: res.url }
  } catch {
    return null
  }
}

async function checkRobots(origin: string): Promise<(url: string) => boolean> {
  try {
    const res = await fetch(`${origin}/robots.txt`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return () => true
    // Simple robots check — skip URLs containing disallowed paths
    const text = await res.text()
    const disallowed: string[] = []
    for (const line of text.split('\n')) {
      const match = line.match(/^Disallow:\s*(.+)/i)
      if (match) disallowed.push(match[1].trim())
    }
    return (url: string) => {
      const path = new URL(url).pathname
      return !disallowed.some(d => d !== '/' && path.startsWith(d))
    }
  } catch {
    return () => true
  }
}

const MAX_CONCURRENT = 3

export async function scrapeWebsite(
  startUrl: string,
  onProgress?: (pagesScraped: number) => void
): Promise<ScrapedPage[]> {
  const origin = new URL(startUrl).origin
  const isAllowed = await checkRobots(origin)

  const visited = new Set<string>()
  const queued = new Set<string>([startUrl])
  const pages: ScrapedPage[] = []

  while (queued.size > 0 && pages.length < MAX_PAGES) {
    const batch: string[] = []
    for (const url of queued) {
      if (batch.length >= MAX_CONCURRENT) break
      batch.push(url)
      queued.delete(url)
    }

    await Promise.all(batch.map(async (url) => {
      if (visited.has(url)) return
      visited.add(url)
      if (!isAllowed(url)) return

      const result = await fetchPage(url)
      if (!result) return

      const { html, finalUrl } = result
      const $ = cheerio.load(html)

      const title = $('title').text().trim() || $('h1').first().text().trim() || finalUrl
      const content = extractText($)

      if (content.length > 100 && pages.length < MAX_PAGES) {
        pages.push({ url: finalUrl, title, content })
        onProgress?.(pages.length)
      }

      const links = extractLinks($, finalUrl, origin)
      for (const link of links) {
        if (!visited.has(link)) queued.add(link)
      }

      // Polite delay per request
      await new Promise(r => setTimeout(r, 200))
    }))
  }

  return pages
}
