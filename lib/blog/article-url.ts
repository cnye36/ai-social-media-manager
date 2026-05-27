const BLOG_PATH = '/blog'

/** Fix common typos and ensure the site base ends with `/blog` (no trailing slash). */
export function normalizeBlogBaseUrl(baseUrl: string): string {
  let trimmed = baseUrl.trim()
  if (!trimmed) return trimmed

  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`
  }

  try {
    const url = new URL(trimmed)
    let path = url.pathname.replace(/\/+$/, '') || ''

    path = path.replace(/\/bog$/i, BLOG_PATH)

    if (!path.endsWith(BLOG_PATH)) {
      if (path === '' || path === '/') {
        path = BLOG_PATH
      } else if (!path.includes(BLOG_PATH)) {
        path = `${path}${BLOG_PATH}`
      }
    }

    url.pathname = path
    return url.toString().replace(/\/$/, '')
  } catch {
    const fixed = trimmed.replace(/\/bog\/?$/i, BLOG_PATH).replace(/\/+$/, '')
    if (/\/blog$/i.test(fixed)) return fixed
    return `${fixed}${BLOG_PATH}`
  }
}

/** Public article URL: `{base}/blog/{slug}` (base may already include `/blog`). */
export function buildArticlePublicUrl(baseUrl: string, slug: string): string {
  const cleanSlug = slug.trim().replace(/^\/+/, '')
  if (!cleanSlug) return normalizeBlogBaseUrl(baseUrl)

  const base = normalizeBlogBaseUrl(baseUrl)
  return `${base}/${cleanSlug}`
}

/** Default production blog base when no site is configured. */
export const DEFAULT_BLOG_BASE_URL = 'https://ai-automatedhq.com/blog'
