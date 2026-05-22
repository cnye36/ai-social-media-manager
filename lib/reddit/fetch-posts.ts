/**
 * Fetches recent posts from a subreddit. Reddit blocks anonymous .json from many
 * datacenter IPs (403); uses OAuth when configured, otherwise RSS (reliable).
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
  | { ok: true; posts: RedditPost[]; source: 'oauth' | 'rss' | 'json' }
  | { ok: false; status: number; source: 'oauth' | 'rss' | 'json'; detail: string }

const USER_AGENT =
  process.env.REDDIT_USER_AGENT ??
  'web:social-media-manager:v1.0 (by /u/affinitybots)'

let cachedToken: { token: string; expiresAt: number } | null = null

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

function basicAuthHeader(clientId: string, clientSecret: string): string {
  const raw = `${clientId}:${clientSecret}`
  if (typeof btoa === 'function') return btoa(raw)
  return Buffer.from(raw).toString('base64')
}

async function getOAuthToken(): Promise<string | null> {
  const clientId = process.env.REDDIT_CLIENT_ID
  const clientSecret = process.env.REDDIT_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token
  }

  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuthHeader(clientId, clientSecret)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
  })

  if (!res.ok) return null

  const json = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!json.access_token) return null

  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  }
  return cachedToken.token
}

function mapListingChild(data: Record<string, unknown>): RedditPost {
  return {
    id: String(data.id ?? ''),
    name: String(data.name ?? `t3_${data.id ?? ''}`),
    title: String(data.title ?? ''),
    selftext: String(data.selftext ?? ''),
    url: String(data.url ?? ''),
    author: String(data.author ?? ''),
    score: Number(data.score ?? 0),
    num_comments: Number(data.num_comments ?? 0),
    subreddit: String(data.subreddit ?? ''),
    created_utc: Number(data.created_utc ?? 0),
  }
}

async function fetchViaOAuth(
  subreddit: string,
  after?: string | null,
): Promise<FetchPostsResult> {
  const token = await getOAuthToken()
  if (!token) {
    return { ok: false, status: 0, source: 'oauth', detail: 'No Reddit OAuth credentials configured' }
  }

  const params = new URLSearchParams({ limit: '100', raw_json: '1' })
  if (after) params.set('after', after)

  const res = await fetch(
    `https://oauth.reddit.com/r/${subreddit}/new?${params}`,
    {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': USER_AGENT },
      cache: 'no-store',
    },
  )

  const body = await res.text().catch(() => '')
  if (!res.ok) {
    return { ok: false, status: res.status, source: 'oauth', detail: body.slice(0, 300) }
  }

  let json: { data?: { children?: { data: Record<string, unknown> }[] } }
  try {
    json = JSON.parse(body) as typeof json
  } catch {
    return { ok: false, status: res.status, source: 'oauth', detail: 'Invalid JSON from oauth.reddit.com' }
  }

  const posts = (json.data?.children ?? []).map(c => mapListingChild(c.data))
  return { ok: true, posts, source: 'oauth' }
}

async function fetchViaPublicJson(
  subreddit: string,
  after?: string | null,
): Promise<FetchPostsResult> {
  const params = new URLSearchParams({ limit: '100' })
  if (after) params.set('after', after)

  const res = await fetch(`https://www.reddit.com/r/${subreddit}/new.json?${params}`, {
    headers: { 'User-Agent': USER_AGENT },
    cache: 'no-store',
  })

  const body = await res.text().catch(() => '')
  if (!res.ok) {
    return { ok: false, status: res.status, source: 'json', detail: body.slice(0, 300) }
  }

  let json: { data?: { children?: { data: Record<string, unknown> }[] } }
  try {
    json = JSON.parse(body) as typeof json
  } catch {
    return { ok: false, status: res.status, source: 'json', detail: 'Non-JSON response (likely blocked)' }
  }

  const posts = (json.data?.children ?? []).map(c => mapListingChild(c.data))
  return { ok: true, posts, source: 'json' }
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
    const updatedMatch = block.match(/<updated>([^<]+)<\/updated>/)
    const categoryMatch = block.match(/<category term="([^"]+)"/)

    const name = idMatch?.[1]?.trim() ?? ''
    const baseId = name.startsWith('t3_') ? name.slice(3) : postIdFromUrl(linkMatch?.[1] ?? '')
    const href = linkMatch?.[1] ?? `https://www.reddit.com/r/${subreddit}/comments/${baseId}/`
    const selftext = contentMatch?.[1] ? stripHtml(contentMatch[1]) : ''
    const updated = updatedMatch?.[1] ? Date.parse(updatedMatch[1]) / 1000 : 0

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
      created_utc: updated,
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
  if (process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET) {
    const oauth = await fetchViaOAuth(subreddit, after)
    if (oauth.ok) return oauth
    console.error(`Reddit OAuth failed for r/${subreddit}:`, oauth.detail)
  }

  const json = await fetchViaPublicJson(subreddit, after)
  if (json.ok) return json

  const rss = await fetchViaRss(subreddit)
  if (rss.ok && after && rss.posts.length) {
    const idx = rss.posts.findIndex(p => p.name === after)
    const slice = idx >= 0 ? rss.posts.slice(0, idx) : rss.posts
    return { ...rss, posts: slice }
  }
  return rss
}
