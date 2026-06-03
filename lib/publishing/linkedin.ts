import type { Post } from '@/types/database'
import { postBodyForPublish } from '@/lib/generate/image-prompt'
import type { PublishResult } from './types'

// Smithery MCP: https://smithery.ai/server/linkedin
// Required env vars:
//   LINKEDIN_MCP_URL   — Smithery gateway URL for the LinkedIn MCP server
//   LINKEDIN_API_KEY   — Smithery API key
//
// The LinkedIn MCP `create_post` tool accepts:
//   { content: string, visibility: 'PUBLIC' | 'CONNECTIONS' }

export async function publishToLinkedIn(post: Post): Promise<PublishResult> {
  const url = process.env.LINKEDIN_MCP_URL
  const apiKey = process.env.LINKEDIN_API_KEY
  if (!url || !apiKey) throw new Error('LINKEDIN_MCP_URL and LINKEDIN_API_KEY are required')

  const res = await fetch(`${url}/tools/create_post`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ content: postBodyForPublish(post.content), visibility: 'PUBLIC' }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`LinkedIn MCP error ${res.status}: ${text}`)
  }

  const data = await res.json() as { id?: string }
  return { success: true, platformPostId: data.id }
}
