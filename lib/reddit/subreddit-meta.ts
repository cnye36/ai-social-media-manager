const USER_AGENT = process.env.REDDIT_USER_AGENT ?? 'social-media-manager-bot/1.0'

export async function fetchSubredditRules(sub: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.reddit.com/r/${sub}/about/rules.json`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return null
    const data = await res.json() as {
      rules?: Array<{ short_name: string; description: string }>
    }
    if (!data.rules?.length) return null
    return data.rules
      .map((r, i) =>
        `${i + 1}. **${r.short_name}**${r.description ? ': ' + r.description.replace(/\n+/g, ' ').trim().slice(0, 300) : ''}`
      )
      .join('\n')
  } catch {
    return null
  }
}

export async function fetchSubredditAbout(sub: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.reddit.com/r/${sub}/about.json`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return null
    const data = await res.json() as {
      data?: {
        public_description?: string
        description?: string
        submission_type?: string
        submit_text?: string
        display_name_prefixed?: string
      }
    }
    const d = data.data
    if (!d) return null
    const parts: string[] = []
    if (d.public_description?.trim()) parts.push(`Sidebar: ${d.public_description.trim().slice(0, 800)}`)
    if (d.description?.trim() && d.description !== d.public_description) {
      parts.push(`Full description: ${d.description.trim().slice(0, 600)}`)
    }
    if (d.submission_type) parts.push(`Allowed submission types: ${d.submission_type}`)
    if (d.submit_text?.trim()) parts.push(`Submit box text: ${d.submit_text.trim().slice(0, 400)}`)
    return parts.length ? parts.join('\n') : null
  } catch {
    return null
  }
}

export async function fetchTrendingPostTitles(sub: string, limit = 12): Promise<string[]> {
  try {
    const res = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=${limit}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return []
    const data = await res.json() as {
      data?: { children?: Array<{ data?: { title?: string; is_self?: boolean; link_flair_text?: string } }> }
    }
    return (data.data?.children ?? [])
      .filter(c => c.data?.title)
      .map(c => {
        const title = c.data!.title!
        const flair = c.data?.link_flair_text
        return flair ? `[${flair}] ${title}` : title
      })
      .slice(0, 10)
  } catch {
    return []
  }
}
