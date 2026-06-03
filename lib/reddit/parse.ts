import { splitImagePromptFromText } from '@/lib/generate/image-prompt'

export interface RedditPostContent {
  title: string
  body: string
  subreddit?: string
  disclosure?: string | null
}

function stripImagePrompt(text: string): { content: string; imagePrompt?: string } {
  const { content, imagePrompt } = splitImagePromptFromText(text)
  return { content: content.trim(), ...(imagePrompt ? { imagePrompt } : {}) }
}

/** Pull a JSON object string from markdown fences or embedded `{...}`. */
function extractJsonObject(text: string): string | null {
  const trimmed = text.trim()
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch) return fenceMatch[1].trim()

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start !== -1 && end > start) return trimmed.slice(start, end + 1)

  return trimmed.startsWith('{') ? trimmed : null
}

export function parseRedditPost(raw: string): {
  post: RedditPostContent | null
  imagePrompt?: string
} {
  const { content: withoutImage, imagePrompt } = stripImagePrompt(raw)

  try {
    const jsonStr = extractJsonObject(withoutImage)
    if (!jsonStr) return { post: null, imagePrompt }

    const parsed = JSON.parse(jsonStr) as Record<string, unknown>
    const title = typeof parsed.title === 'string' ? parsed.title.trim() : ''
    const body = typeof parsed.body === 'string' ? parsed.body.trim() : ''

    if (!title || !body) return { post: null, imagePrompt }

    const subreddit =
      typeof parsed.subreddit === 'string'
        ? parsed.subreddit.replace(/^r\//, '').trim()
        : undefined

    const disclosure =
      parsed.disclosure === null || parsed.disclosure === undefined
        ? null
        : String(parsed.disclosure).trim() || null

    return {
      post: { title, body, subreddit, disclosure },
      imagePrompt,
    }
  } catch {
    return { post: null, imagePrompt }
  }
}

export function formatRedditMarkdown(post: RedditPostContent): string {
  const disclosureLine = post.disclosure ? `\n\n*Disclosure: ${post.disclosure}*` : ''
  return `**${post.title}**\n\n${post.body}${disclosureLine}`
}
