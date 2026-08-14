import { run } from '@openai/agents'
import { createClient } from '@/lib/supabase/server'
import { retrieve } from '@/lib/rag/retrieve'
import { buildLinkedInAgent } from './linkedin-agent'
import { buildXAgent } from './x-agent'
import { buildRedditAgent } from './reddit-agent'
import { buildFacebookAgent } from './facebook-agent'
import type { Channel } from '@/types/database'
import type { GenerateRequest, GeneratedPost, ThreadTweet } from '@/types/agents'
import { stripEmDashes } from '@/lib/content/no-em-dash'
import { scorePost, scoreXThread } from '@/lib/content/score-post'
import { formatRedditMarkdown, parseRedditPost, type RedditPostContent } from '@/lib/reddit/parse'
import { buildSubredditPromptBlock, loadSubredditConfig } from '@/lib/reddit/subreddit-config'
import { splitImagePromptFromText } from '@/lib/generate/image-prompt'
import { buildChannelVarietyBlock } from '@/lib/content/channel-variety'
import { fetchRecentChannelPosts } from '@/lib/content/recent-posts'
import type { Post } from '@/types/database'

const agentBuilders: Record<Channel, (p: Parameters<typeof buildLinkedInAgent>[0]) => ReturnType<typeof buildLinkedInAgent>> = {
  linkedin: buildLinkedInAgent,
  x: buildXAgent,
  reddit: buildRedditAgent,
  facebook: buildFacebookAgent,
}

async function prepareAgent(request: GenerateRequest) {
  const { companyId, channel, topic, contentGoal, postLength, additionalContext, subreddit } = request
  const supabase = await createClient()

  const [companyResult, brandResult, knowledgeChunks, subredditConfig, recentPosts] = await Promise.all([
    supabase.from('companies').select('name, account_type').eq('id', companyId).single(),
    supabase.from('brand_profiles').select('*').eq('company_id', companyId).single(),
    retrieve(companyId, topic, 5, 0.35),
    channel === 'reddit' && subreddit
      ? loadSubredditConfig(supabase, companyId, subreddit)
      : Promise.resolve(null),
    fetchRecentChannelPosts(supabase, companyId, channel),
  ])

  const subredditContext =
    channel === 'reddit' && subreddit
      ? buildSubredditPromptBlock(subredditConfig, subreddit)
      : null

  const mergedContext = [additionalContext?.trim(), subredditContext].filter(Boolean).join('\n\n')

  const agentParams = {
    companyId,
    companyName: companyResult.data?.name ?? 'the company',
    accountType: request.voice === 'personal'
      ? 'founder'
      : request.voice === 'company'
        ? 'company'
        : (companyResult.data?.account_type ?? 'company'),
    brand: brandResult.data ?? null,
    retrievedKnowledge: knowledgeChunks,
    topic,
    contentGoal,
    postLength,
    additionalContext: mergedContext || undefined,
    threadMode: request.threadMode,
    includeDisclosure: request.includeDisclosure,
    targetSubreddit: subreddit?.replace(/^r\//, ''),
  }

  return { agent: agentBuilders[channel](agentParams), channel, recentPosts }
}

function buildGenerationPrompt(
  request: GenerateRequest,
  channel: Channel,
  recentPosts: Post[],
): string {
  const format = channel === 'x' && request.threadMode ? 'thread' : 'post'
  const base = `Write a ${channel} ${format} about: ${request.topic}`
  return `${base}\n\n${buildChannelVarietyBlock(channel, recentPosts)}`
}

function applyRedditDisclosurePreference(
  parsed: { content: string; contentVariants: Record<string, unknown> },
  includeDisclosure: boolean | undefined,
): { content: string; contentVariants: Record<string, unknown> } {
  if (includeDisclosure) return parsed
  const reddit = parsed.contentVariants.reddit as RedditPostContent | undefined
  if (!reddit) return parsed
  const post = { ...reddit, disclosure: null }
  return {
    content: formatRedditMarkdown(post),
    contentVariants: { ...parsed.contentVariants, reddit: post },
  }
}

function parseImagePrompt(text: string): { content: string; imagePrompt?: string } {
  const { content, imagePrompt } = splitImagePromptFromText(text)
  return {
    content: stripEmDashes(content),
    ...(imagePrompt ? { imagePrompt: stripEmDashes(imagePrompt) } : {}),
  }
}

// Extract plain text from raw agent output for quality scoring
function extractScorableText(raw: string, channel: Channel): string {
  if (channel === 'reddit') {
    try {
      const cleaned = raw.replace(/```json\s*/g, '').replace(/\s*```/g, '')
      const parsed = JSON.parse(cleaned) as { body?: string }
      if (parsed.body) return parsed.body
    } catch { /* fall through */ }
  }
  if (channel === 'x') {
    try {
      const parsed = JSON.parse(raw) as { thread?: unknown[] }
      if (Array.isArray(parsed.thread)) {
        return parsed.thread
          .map(t => (typeof t === 'string' ? t : (t as { text?: string }).text ?? ''))
          .join('\n\n')
      }
    } catch { /* fall through */ }
  }
  return raw.split('\n--\nIMAGE_PROMPT:')[0].trim()
}

function sanitizeContentVariants(variants: Record<string, unknown>): Record<string, unknown> {
  const out = { ...variants }
  if (typeof out.imagePrompt === 'string') out.imagePrompt = stripEmDashes(out.imagePrompt)
  if (Array.isArray(out.thread)) {
    out.thread = (out.thread as { text: string; imagePrompt?: string }[]).map(t => ({
      ...t,
      text: stripEmDashes(t.text),
      ...(t.imagePrompt ? { imagePrompt: stripEmDashes(t.imagePrompt) } : {}),
    }))
  }
  const reddit = out.reddit as RedditPostContent | undefined
  if (reddit) {
    out.reddit = {
      ...reddit,
      title: stripEmDashes(reddit.title),
      body: stripEmDashes(reddit.body),
    }
  }
  return out
}

function parseRedditContent(raw: string): { content: string; contentVariants: Record<string, unknown> } {
  const { post, imagePrompt } = parseRedditPost(raw)
  if (post) {
    const sanitized = {
      ...post,
      title: stripEmDashes(post.title),
      body: stripEmDashes(post.body),
    }
    return {
      content: formatRedditMarkdown(sanitized),
      contentVariants: { reddit: sanitized, ...(imagePrompt ? { imagePrompt } : {}) },
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
      const thread: ThreadTweet[] = parsed.thread.map((t: string | ThreadTweet) => {
        const tweet = typeof t === 'string' ? { text: t } : t
        return { ...tweet, text: stripEmDashes(tweet.text) }
      })
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
  const { agent, channel, recentPosts } = await prepareAgent(request)

  const basePrompt = buildGenerationPrompt(request, channel, recentPosts)
  const result = await run(agent, basePrompt)
  let rawOutput = result.finalOutput ?? ''

  // Score and refine once if quality is low (non-streaming path only)
  const threadForScoring = channel === 'x' && request.threadMode
    ? parseXContent(rawOutput).contentVariants.thread as ThreadTweet[] | undefined
    : undefined
  const { pass, issues } = threadForScoring?.length
    ? await scoreXThread(threadForScoring.map(t => t.text))
    : await scorePost(extractScorableText(rawOutput, channel), channel)
  if (!pass && issues.length > 0) {
    // Revise the existing draft instead of regenerating from scratch — keeps what
    // already works and avoids the agent re-running its knowledge tool calls.
    const critiquePrompt = `${basePrompt}\n\nHere is your previous draft:\n\n${rawOutput}\n\nRevise this draft to fix ALL of the issues below. Keep everything that already works — same angle, same voice.\n${issues.map(i => `- ${i}`).join('\n')}`
    const refined = await run(agent, critiquePrompt)
    rawOutput = refined.finalOutput ?? rawOutput
  }

  // Parse channel-specific formats
  if (channel === 'reddit') {
    const parsed = parseRedditContent(rawOutput)
    const { content, contentVariants } = applyRedditDisclosurePreference(parsed, request.includeDisclosure)
    const { imagePrompt } = parseImagePrompt(rawOutput)
    return {
      content,
      channel,
      imagePrompt,
      contentVariants: sanitizeContentVariants(contentVariants),
    }
  }

  if (channel === 'x') {
    const { content, contentVariants } = parseXContent(rawOutput)
    const imagePrompt = (contentVariants.imagePrompt as string | undefined)
    return {
      content,
      channel,
      imagePrompt,
      contentVariants: sanitizeContentVariants(contentVariants),
    }
  }

  // LinkedIn and Facebook — plain text with image prompt suffix
  const { content, imagePrompt } = parseImagePrompt(rawOutput)
  return { content, channel, imagePrompt, contentVariants: {} }
}

// Returns a ReadableStream<string> of text tokens for streaming responses
export async function generatePostReadableStream(request: GenerateRequest): Promise<ReadableStream<string>> {
  const { agent, channel, recentPosts } = await prepareAgent(request)
  const streamedResult = await run(agent, buildGenerationPrompt(request, channel, recentPosts), { stream: true })
  // Cast needed due to ReadableStream type mismatch between SDK and Web APIs
  return streamedResult.toTextStream() as unknown as ReadableStream<string>
}
