import type { Post } from '@/types/database'
import type { PublishResult } from './types'

// Facebook Graph API — direct calls (no MCP needed, one HTTP request each)
// Required env vars:
//   FACEBOOK_ACCESS_TOKEN  — long-lived Page/User access token
//   FACEBOOK_PAGE_ID       — your Page ID (for Page posts)
//   FACEBOOK_GROUP_ID      — your Group ID (for Group posts, primary target)
//
// To get a long-lived token:
//   1. Create a Facebook Developer App at developers.facebook.com
//   2. Add yourself as admin/tester (no App Review needed for your own accounts)
//   3. Use Graph API Explorer to get a token with publish_to_groups + pages_manage_posts
//   4. Exchange for a long-lived token (60-day expiry; set a reminder to refresh)

const GRAPH = 'https://graph.facebook.com/v21.0'

export async function publishToFacebook(post: Post): Promise<PublishResult> {
  const token = process.env.FACEBOOK_ACCESS_TOKEN
  const groupId = process.env.FACEBOOK_GROUP_ID
  const pageId = process.env.FACEBOOK_PAGE_ID

  if (!token) throw new Error('FACEBOOK_ACCESS_TOKEN is required')

  // Prefer Group, fall back to Page
  const targetId = groupId ?? pageId
  if (!targetId) throw new Error('FACEBOOK_GROUP_ID or FACEBOOK_PAGE_ID is required')

  const res = await fetch(`${GRAPH}/${targetId}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: post.content, access_token: token }),
  })

  const data = await res.json() as { id?: string; error?: { message: string } }
  if (!res.ok || data.error) {
    throw new Error(`Facebook Graph API error: ${data.error?.message ?? res.statusText}`)
  }

  return { success: true, platformPostId: data.id }
}
