import { run } from '@openai/agents'
import { createClient } from '@/lib/supabase/server'
import { retrieve } from '@/lib/rag/retrieve'
import { buildLinkedInAgent } from './linkedin-agent'
import { buildXAgent } from './x-agent'
import { buildRedditAgent } from './reddit-agent'
import { buildFacebookAgent } from './facebook-agent'
import type { Channel } from '@/types/database'
import type { GenerateRequest, GeneratedPost } from '@/types/agents'

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
  try {
    // Strip image prompt first
    const { content: withoutImage, imagePrompt } = parseImagePrompt(raw)
    const parsed = JSON.parse(withoutImage)
    if (parsed.title && parsed.body) {
      const formatted = `**${parsed.title}**\n\n${parsed.body}${parsed.disclosure ? `\n\n*Disclosure: ${parsed.disclosure}*` : ''}`
      return {
        content: formatted,
        contentVariants: { reddit: parsed, imagePrompt },
      }
    }
  } catch {
    // Not JSON — return as-is
  }
  return { content: raw.trim(), contentVariants: {} }
}

function parseXContent(raw: string): { content: string; contentVariants: Record<string, unknown> } {
  try {
    const { content: withoutImage, imagePrompt } = parseImagePrompt(raw)
    const parsed = JSON.parse(withoutImage)
    if (parsed.thread && Array.isArray(parsed.thread)) {
      return {
        content: parsed.thread.join('\n\n---\n\n'),
        contentVariants: { thread: parsed.thread, imagePrompt },
      }
    }
  } catch {
    // Single tweet
  }
  const { content, imagePrompt } = parseImagePrompt(raw)
  return { content, contentVariants: { imagePrompt } }
}

export async function generatePost(request: GenerateRequest): Promise<GeneratedPost> {
  const { companyId, channel, topic, contentGoal, postLength, additionalContext } = request

  const supabase = await createClient()

  // Fetch company name and brand profile in parallel with RAG retrieval
  const [companyResult, brandResult, knowledgeChunks] = await Promise.all([
    supabase.from('companies').select('name').eq('id', companyId).single(),
    supabase.from('brand_profiles').select('*').eq('company_id', companyId).single(),
    retrieve(companyId, topic, 5, 0.35),
  ])

  const companyName = companyResult.data?.name ?? 'the company'
  const brand = brandResult.data ?? null

  const agentParams = {
    companyId,
    companyName,
    brand,
    retrievedKnowledge: knowledgeChunks,
    topic,
    contentGoal,
    postLength,
    additionalContext,
  }

  // Select the right agent for the channel
  const agentBuilders: Record<Channel, (p: typeof agentParams) => ReturnType<typeof buildLinkedInAgent>> = {
    linkedin: buildLinkedInAgent,
    x: buildXAgent,
    reddit: buildRedditAgent,
    facebook: buildFacebookAgent,
  }

  const agent = agentBuilders[channel](agentParams)

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
  const { companyId, channel, topic, contentGoal, postLength, additionalContext } = request

  const supabase = await createClient()

  const [companyResult, brandResult, knowledgeChunks] = await Promise.all([
    supabase.from('companies').select('name').eq('id', companyId).single(),
    supabase.from('brand_profiles').select('*').eq('company_id', companyId).single(),
    retrieve(companyId, topic, 5, 0.35),
  ])

  const companyName = companyResult.data?.name ?? 'the company'
  const brand = brandResult.data ?? null

  const agentParams = {
    companyId,
    companyName,
    brand,
    retrievedKnowledge: knowledgeChunks,
    topic,
    contentGoal,
    postLength,
    additionalContext,
  }

  const agentBuilders: Record<Channel, (p: typeof agentParams) => ReturnType<typeof buildLinkedInAgent>> = {
    linkedin: buildLinkedInAgent,
    x: buildXAgent,
    reddit: buildRedditAgent,
    facebook: buildFacebookAgent,
  }

  const agent = agentBuilders[channel](agentParams)
  const streamedResult = await run(agent, `Write a ${channel} post about: ${topic}`, { stream: true })
  // Cast needed due to ReadableStream type mismatch between SDK and Web APIs
  return streamedResult.toTextStream() as unknown as ReadableStream<string>
}
