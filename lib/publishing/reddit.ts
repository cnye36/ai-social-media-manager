import type { Post } from '@/types/database'
import type { PublishResult } from './types'

// TODO: Replace Smithery MCP approach with direct Reddit OAuth2 (PRAW-style).
//   Reddit OAuth app is free. Flow:
//   1. /api/reddit/auth/connect  — redirects to reddit.com/api/v1/authorize
//   2. /api/reddit/auth/callback — exchanges code for access+refresh tokens, stores in
//      reddit_accounts table (company_id, username, access_token, refresh_token, expires_at)
//   3. publishToReddit() / postReply() reads token from DB, auto-refreshes if expired
//   Required env vars once migrated:
//     REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_REDIRECT_URI
//
// TODO: Add postReply(opportunityId, draftReply) — submits a comment to an existing post.
//   Called from /api/reddit/opportunities/[id]/post-reply only when subreddit reply_policy = 'auto'.
//
// Current approach uses Smithery MCP (kept until OAuth is wired up):
//   REDDIT_MCP_URL, REDDIT_API_KEY, REDDIT_SUBREDDIT

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
