/**
 * Keyless Reddit read: public RSS feeds for /r/{subreddit}/new.
 * Reddit blocks anonymous .json from most server IPs; RSS is reliable for
 * titles, body, author, permalink, and original post time.
 */

export interface RedditPost {
  id: string
  name: string
  title: string
  selftext: string
  url: string
  author: string
  score: number
  num_comments: number
  subreddit: string
  created_utc: number
}

export type FetchPostsResult =
  | { ok: true; posts: RedditPost[]; source: 'rss' }
  | { ok: false; status: number; source: 'rss'; detail: string }

const USER_AGENT =
  process.env.REDDIT_USER_AGENT ??
  'social-media-manager/1.0 (read-only; +https://github.com)'

function stripHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#32;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function postIdFromUrl(href: string): string {
  const m = href.match(/\/comments\/([a-z0-9]+)\//i)
  return m?.[1] ?? href
}

function parseEntryTimestamp(block: string): number {
  const published = block.match(/<published>([^<]+)<\/published>/)?.[1]
  const updated = block.match(/<updated>([^<]+)<\/updated>/)?.[1]
  const iso = published ?? updated
  if (!iso) return 0
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0
}

async function fetchViaRss(subreddit: string): Promise<FetchPostsResult> {
  const res = await fetch(`https://www.reddit.com/r/${subreddit}/new/.rss?limit=100`, {
    headers: { 'User-Agent': USER_AGENT },
    cache: 'no-store',
  })

  const xml = await res.text().catch(() => '')
  if (!res.ok) {
    return { ok: false, status: res.status, source: 'rss', detail: xml.slice(0, 300) }
  }

  const posts: RedditPost[] = []
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g
  let match: RegExpExecArray | null

  while ((match = entryRe.exec(xml)) !== null) {
    const block = match[1]
    const idMatch = block.match(/<id>([^<]+)<\/id>/)
    const titleMatch = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)
    const linkMatch = block.match(/<link href="([^"]+)"/)
    const contentMatch = block.match(/<content[^>]*>([\s\S]*?)<\/content>/)
    const authorMatch = block.match(/<name>(?:\/u\/)?([^<]+)<\/name>/)
    const categoryMatch = block.match(/<category term="([^"]+)"/)

    const name = idMatch?.[1]?.trim() ?? ''
    const baseId = name.startsWith('t3_') ? name.slice(3) : postIdFromUrl(linkMatch?.[1] ?? '')
    const href = linkMatch?.[1] ?? `https://www.reddit.com/r/${subreddit}/comments/${baseId}/`
    const selftext = contentMatch?.[1] ? stripHtml(contentMatch[1]) : ''

    posts.push({
      id: baseId,
      name: name.startsWith('t3_') ? name : `t3_${baseId}`,
      title: (titleMatch?.[1] ?? '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').trim(),
      selftext,
      url: href,
      author: authorMatch?.[1] ?? '',
      score: 0,
      num_comments: 0,
      subreddit: categoryMatch?.[1] ?? subreddit,
      created_utc: parseEntryTimestamp(block),
    })
  }

  if (!posts.length) {
    return { ok: false, status: res.status, source: 'rss', detail: 'RSS feed had no entries' }
  }

  return { ok: true, posts, source: 'rss' }
}

export async function fetchNewPosts(
  subreddit: string,
  after?: string | null,
): Promise<FetchPostsResult> {
  const rss = await fetchViaRss(subreddit)
  if (!rss.ok) return rss

  let posts = rss.posts
  if (after && posts.length) {
    const idx = posts.findIndex(p => p.name === after)
    posts = idx >= 0 ? posts.slice(0, idx) : posts
  }

  return { ok: true, posts, source: 'rss' }
}
