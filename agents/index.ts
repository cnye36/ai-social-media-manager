import { run } from '@openai/agents'
import { createClient } from '@/lib/supabase/server'
import { retrieve } from '@/lib/rag/retrieve'
import { buildLinkedInAgent } from './linkedin-agent'
import { buildXAgent } from './x-agent'
import { buildRedditAgent } from './reddit-agent'
import { buildFacebookAgent } from './facebook-agent'
import type { Channel } from '@/types/database'
import type { GenerateRequest, GeneratedPost, ThreadTweet } from '@/types/agents'
import { formatRedditMarkdown, parseRedditPost } from '@/lib/reddit/parse'

const agentBuilders: Record<Channel, (p: Parameters<typeof buildLinkedInAgent>[0]) => ReturnType<typeof buildLinkedInAgent>> = {
  linkedin: buildLinkedInAgent,
  x: buildXAgent,
  reddit: buildRedditAgent,
  facebook: buildFacebookAgent,
}

async function prepareAgent(request: GenerateRequest) {
  const { companyId, channel, topic, contentGoal, postLength, additionalContext } = request
  const supabase = await createClient()

  const [companyResult, brandResult, knowledgeChunks] = await Promise.all([
    supabase.from('companies').select('name').eq('id', companyId).single(),
    supabase.from('brand_profiles').select('*').eq('company_id', companyId).single(),
    retrieve(companyId, topic, 5, 0.35),
  ])

  const agentParams = {
    companyId,
    companyName: companyResult.data?.name ?? 'the company',
    brand: brandResult.data ?? null,
    retrievedKnowledge: knowledgeChunks,
    topic,
    contentGoal,
    postLength,
    additionalContext,
    threadMode: request.threadMode,
  }

  return { agent: agentBuilders[channel](agentParams), channel }
}

function parseImagePrompt(text: string): { content: string; imagePrompt?: string } {
  const marker = '\n--\nIMAGE_PROMPT:'
  const idx = text.indexOf(marker)
  if (idx === -1) return { content: text.trim() }
  return {
    content: text.slice(0, idx).trim(),
    imagePrompt: text.slice(idx + marker.length).trim(),
  }
}

function parseRedditContent(raw: string): { content: string; contentVariants: Record<string, unknown> } {
  const { post, imagePrompt } = parseRedditPost(raw)
  if (post) {
    return {
      content: formatRedditMarkdown(post),
      contentVariants: { reddit: post, ...(imagePrompt ? { imagePrompt } : {}) },
    }
  }
  const { content } = parseImagePrompt(raw)
  return { content, contentVariants: {} }
}

function parseXContent(raw: string): { content: string; contentVariants: Record<string, unknown> } {
  try {
    const { content: withoutImage, imagePrompt } = parseImagePrompt(raw)
    const parsed = JSON.parse(withoutImage)
    if (parsed.thread && Array.isArray(parsed.thread)) {
      // Normalize: accept both string[] (legacy) and ThreadTweet[] (thread mode)
      const thread: ThreadTweet[] = parsed.thread.map((t: string | ThreadTweet) =>
        typeof t === 'string' ? { text: t } : t
      )
      const content = thread.map(t => t.text).join('\n\n---\n\n')
      return {
        content,
        contentVariants: { thread, ...(imagePrompt ? { imagePrompt } : {}) },
      }
    }
  } catch {
    // Single tweet — fall through
  }
  const { content, imagePrompt } = parseImagePrompt(raw)
  return { content, contentVariants: { imagePrompt } }
}

export async function generatePost(request: GenerateRequest): Promise<GeneratedPost> {
  const { topic } = request
  const { agent, channel } = await prepareAgent(request)

  const result = await run(agent, `Write a ${channel} post about: ${topic}`)
  const rawOutput = result.finalOutput ?? ''

  // Parse channel-specific formats
  if (channel === 'reddit') {
    const { content, contentVariants } = parseRedditContent(rawOutput)
    const { imagePrompt } = parseImagePrompt(rawOutput)
    return { content, channel, imagePrompt, contentVariants }
  }

  if (channel === 'x') {
    const { content, contentVariants } = parseXContent(rawOutput)
    const imagePrompt = (contentVariants.imagePrompt as string | undefined)
    return { content, channel, imagePrompt, contentVariants }
  }

  // LinkedIn and Facebook — plain text with image prompt suffix
  const { content, imagePrompt } = parseImagePrompt(rawOutput)
  return { content, channel, imagePrompt, contentVariants: {} }
}

// Returns a ReadableStream<string> of text tokens for streaming responses
export async function generatePostReadableStream(request: GenerateRequest): Promise<ReadableStream<string>> {
  const { topic } = request
  const { agent, channel } = await prepareAgent(request)
  const streamedResult = await run(agent, `Write a ${channel} post about: ${topic}`, { stream: true })
  // Cast needed due to ReadableStream type mismatch between SDK and Web APIs
  return streamedResult.toTextStream() as unknown as ReadableStream<string>
}
