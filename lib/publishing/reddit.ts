import type { Post } from '@/types/database'
import type { PublishResult } from './types'

// Smithery MCP: https://smithery.ai/server/@jordanburke/reddit-mcp-server
// Required env vars:
//   REDDIT_MCP_URL     — Smithery gateway URL for the Reddit MCP server
//   REDDIT_API_KEY     — Smithery API key
//   REDDIT_SUBREDDIT   — default subreddit to post to (e.g. "test" or your own)
//
// Reddit posts have a "Title: ..." first line (from the generate prompt).
// We parse that out; everything after is the body.

function parseRedditContent(content: string): { title: string; body: string } {
  const lines = content.split('\n')
  const titleLine = lines.find(l => l.toLowerCase().startsWith('title:'))
  if (titleLine) {
    const title = titleLine.replace(/^title:\s*/i, '').trim()
    const body = lines.filter(l => l !== titleLine).join('\n').trim()
    return { title, body }
  }
  // Fallback: use first line as title
  return { title: lines[0].trim(), body: lines.slice(1).join('\n').trim() }
}

export async function publishToReddit(post: Post): Promise<PublishResult> {
  const url = process.env.REDDIT_MCP_URL
  const apiKey = process.env.REDDIT_API_KEY
  const subreddit = process.env.REDDIT_SUBREDDIT
  if (!url || !apiKey || !subreddit) {
    throw new Error('REDDIT_MCP_URL, REDDIT_API_KEY, and REDDIT_SUBREDDIT are required')
  }

  const { title, body } = parseRedditContent(post.content)

  const res = await fetch(`${url}/tools/submit_post`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ subreddit, title, text: body, kind: 'self' }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Reddit MCP error ${res.status}: ${text}`)
  }

  const data = await res.json() as { id?: string }
  return { success: true, platformPostId: data.id }
}
