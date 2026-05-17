import type { Post } from '@/types/database'
import type { PublishResult } from './types'

// TwitterAPI.io — pay-as-you-go write access ($0.15 / 1,000 requests)
// Required env vars:
//   TWITTERAPI_IO_KEY  — your TwitterAPI.io API key
//
// Sign up at https://twitterapi.io and grab an API key.
// No monthly subscription — billed per request.

export async function publishToX(post: Post): Promise<PublishResult> {
  const apiKey = process.env.TWITTERAPI_IO_KEY
  if (!apiKey) throw new Error('TWITTERAPI_IO_KEY is required')

  // Enforce Twitter's 280-char hard limit
  const text = post.content.slice(0, 280)

  const res = await fetch('https://api.twitterapi.io/twitter/tweet/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({ text }),
  })

  const data = await res.json() as { id?: string; tweet?: { id: string }; error?: string }
  if (!res.ok || data.error) {
    throw new Error(`TwitterAPI.io error ${res.status}: ${data.error ?? res.statusText}`)
  }

  const tweetId = data.id ?? data.tweet?.id
  return { success: true, platformPostId: tweetId }
}
