'use client'

import { useState, useEffect, useCallback } from 'react'
import { Sparkles, Loader2, User, Building2, History, RefreshCw, Copy, Check, Trash2, Pencil, CalendarClock, CircleCheck, Clock, GitBranch } from 'lucide-react'
import { XIcon } from '@/components/ui/channel-icons'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { IdeaSpark } from '@/components/generate/IdeaSpark'
import { PostPreview } from '@/components/generate/PostPreview'
import { XThreadEditor } from '@/components/generate/XThreadEditor'
import { PostEditorModal } from '@/components/posts/PostEditorModal'
import { cn } from '@/lib/utils'
import { formatDistanceToNow, format } from 'date-fns'
import { postHasThread } from '@/lib/generate/x-thread'
import type { ContentGoal, GeneratedPost, PostLength } from '@/types/agents'
import type { Post, PostStatus } from '@/types/database'
import type { PostIdea } from '@/app/api/generate/ideas/route'
import { normalizeContentGoal } from '@/lib/content/content-goal'
import { splitImagePromptFromText, postBodyForPublish } from '@/lib/generate/image-prompt'

// ─── Types ───────────────────────────────────────────────────────────────────

type XVoice = 'personal' | 'company'

interface XPageClientProps {
  companyId: string
  brandColors?: { primary?: string; accent?: string }
}

// ─── Constants ───────────────────────────────────────────────────────────────

const GOALS: { id: ContentGoal; label: string; description: string }[] = [
  { id: 'awareness', label: 'Awareness', description: 'Introduce & attract new audiences' },
  { id: 'engagement', label: 'Engagement', description: 'Spark replies & retweets' },
  { id: 'promotion', label: 'Promotion', description: 'Drive action toward a product' },
  { id: 'education', label: 'Education', description: 'Teach something valuable' },
]

const LENGTHS: { id: PostLength; label: string }[] = [
  { id: 'short', label: 'Short' },
  { id: 'medium', label: 'Medium' },
  { id: 'long', label: 'Long' },
]

const STATUS_STYLES: Record<PostStatus, string> = {
  draft: 'text-zinc-400 bg-zinc-800',
  scheduled: 'text-yellow-400 bg-yellow-900/30',
  published: 'text-emerald-400 bg-emerald-900/30',
  archived: 'text-zinc-600 bg-zinc-900',
}

const STATUS_ICONS: Record<PostStatus, React.ReactNode> = {
  draft: <Pencil className="w-3 h-3" />,
  scheduled: <CalendarClock className="w-3 h-3" />,
  published: <CircleCheck className="w-3 h-3" />,
  archived: <Clock className="w-3 h-3" />,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildAdditionalContext(voice: XVoice, userContext: string): string {
  const voiceInstruction =
    voice === 'personal'
      ? 'VOICE: Write as a personal X post from an individual founder/creator. Use first-person "I" and opinionated language. Be direct, punchy, and authentic. This is the human behind the account, not a brand.'
      : 'VOICE: Write as a company X post. Use "we" and "our" language. Keep it brand-appropriate but still sharp and direct — not corporate or generic. Speak as the business.'
  return userContext.trim() ? `${voiceInstruction}\n\n${userContext}` : voiceInstruction
}

// ─── History section ─────────────────────────────────────────────────────────

interface XHistoryProps {
  companyId: string
  refreshKey: number
}

function XHistory({ companyId, refreshKey }: XHistoryProps) {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editorPost, setEditorPost] = useState<Post | null>(null)

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/posts?companyId=${companyId}&channel=x`)
      if (!res.ok) throw new Error('Failed to load posts')
      const data = await res.json() as Post[]
      setPosts(data)
    } catch {
      setError('Could not load X posts')
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => { fetchPosts() }, [fetchPosts, refreshKey])

  async function handleCopy(post: Post) {
    await navigator.clipboard.writeText(postBodyForPublish(post.content))
    setCopiedId(post.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  async function handleDelete(postId: string) {
    setDeletingId(postId)
    try {
      await fetch(`/api/posts/${postId}`, { method: 'DELETE' })
      setPosts(prev => prev.filter(p => p.id !== postId))
    } finally {
      setDeletingId(null)
    }
  }

  function handleEditorUpdate(updated: Post) {
    setPosts(prev => prev.map(p => p.id === updated.id ? updated : p))
  }

  function handleEditorDelete(id: string) {
    setPosts(prev => prev.filter(p => p.id !== id))
    setEditorPost(null)
  }

  const getVoice = (post: Post): XVoice | null => {
    const v = post.generation_params?.x_voice
    return v === 'personal' || v === 'company' ? v : null
  }

  const isThread = (post: Post) => {
    const variants = post.content_variants as Record<string, unknown>
    return Array.isArray(variants?.thread)
  }

  const tweetCount = (post: Post): number => {
    const variants = post.content_variants as Record<string, unknown>
    return Array.isArray(variants?.thread) ? (variants.thread as unknown[]).length : 0
  }

  return (
    <div className="mt-12">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <History className="w-4 h-4 text-zinc-500" />
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">Recent X Posts</h2>
          {!loading && <span className="text-xs text-zinc-600">({posts.length})</span>}
        </div>
        <button
          onClick={fetchPosts}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-400 transition-colors disabled:opacity-40"
        >
          <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-4 py-3">{error}</p>
      )}

      {loading && posts.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-zinc-600 py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading posts…
        </div>
      )}

      {!loading && posts.length === 0 && !error && (
        <div className="text-center py-12 border border-dashed border-zinc-800 rounded-xl">
          <XIcon className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
          <p className="text-sm text-zinc-500">No X posts yet</p>
          <p className="text-xs text-zinc-600 mt-1">Generate your first post above</p>
        </div>
      )}

      {posts.length > 0 && (
        <div className="space-y-2">
          {posts.map(post => {
            const postVoice = getVoice(post)
            const thread = isThread(post)
            const count = tweetCount(post)
            const body = postBodyForPublish(post.content)
            const preview = body.length > 160
              ? body.slice(0, 160).trimEnd() + '…'
              : body
            const charCount = body.length
            const dateLabel = post.published_at
              ? `Published ${formatDistanceToNow(new Date(post.published_at), { addSuffix: true })}`
              : post.scheduled_for
                ? `Scheduled ${format(new Date(post.scheduled_for), 'MMM d, h:mm a')}`
                : `Created ${formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}`

            return (
              <div
                key={post.id}
                className="group flex items-start gap-4 px-4 py-3.5 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors"
              >
                {/* Voice indicator */}
                <div className="shrink-0 pt-0.5">
                  {postVoice === 'personal' ? (
                    <div title="Personal post" className="w-7 h-7 rounded-full bg-zinc-700/50 border border-zinc-600/50 flex items-center justify-center">
                      <User className="w-3.5 h-3.5 text-zinc-300" />
                    </div>
                  ) : postVoice === 'company' ? (
                    <div title="Company post" className="w-7 h-7 rounded-full bg-violet-900/40 border border-violet-700/40 flex items-center justify-center">
                      <Building2 className="w-3.5 h-3.5 text-violet-400" />
                    </div>
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                      <XIcon className="w-3.5 h-3.5 text-zinc-500" />
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    {postVoice && (
                      <span className={cn(
                        'text-[10px] font-medium px-1.5 py-0.5 rounded border capitalize',
                        postVoice === 'personal'
                          ? 'text-zinc-300 bg-zinc-800 border-zinc-600'
                          : 'text-violet-400 bg-violet-900/20 border-violet-700/30'
                      )}>
                        {postVoice === 'personal' ? 'Personal' : 'Company'}
                      </span>
                    )}
                    {thread && (
                      <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border text-sky-400 bg-sky-900/20 border-sky-700/30">
                        <GitBranch className="w-2.5 h-2.5" />
                        Thread{count > 0 ? ` · ${count}` : ''}
                      </span>
                    )}
                    {!thread && (
                      <span className={cn(
                        'text-[10px] font-medium px-1.5 py-0.5 rounded',
                        charCount > 280 ? 'text-red-400 bg-red-900/20' : 'text-zinc-500 bg-zinc-800/60'
                      )}>
                        {charCount}/280
                      </span>
                    )}
                    <span className={cn(
                      'flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded capitalize',
                      STATUS_STYLES[post.status]
                    )}>
                      {STATUS_ICONS[post.status]}
                      {post.status}
                    </span>
                    <span className="text-[10px] text-zinc-600">{dateLabel}</span>
                  </div>
                  <p className="text-sm text-zinc-400 leading-relaxed line-clamp-2">{preview}</p>
                </div>

                {/* Actions */}
                <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setEditorPost(post)}
                    title="Edit post"
                    className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleCopy(post)}
                    title="Copy content"
                    className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                  >
                    {copiedId === post.id
                      ? <Check className="w-3.5 h-3.5 text-green-400" />
                      : <Copy className="w-3.5 h-3.5" />
                    }
                  </button>
                  <button
                    onClick={() => handleDelete(post.id)}
                    disabled={deletingId === post.id}
                    title="Delete post"
                    className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-900/20 transition-colors disabled:opacity-40"
                  >
                    {deletingId === post.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Trash2 className="w-3.5 h-3.5" />
                    }
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editorPost && (
        <PostEditorModal
          post={editorPost}
          open={!!editorPost}
          onOpenChange={open => { if (!open) setEditorPost(null) }}
          onUpdate={handleEditorUpdate}
          onDelete={handleEditorDelete}
          companyId={companyId}
        />
      )}
    </div>
  )
}

// ─── Thread result viewer ─────────────────────────────────────────────────────

interface ThreadResultProps {
  post: GeneratedPost
  companyId: string
  brandColors?: { primary?: string; accent?: string }
  onReset: () => void
}

function ThreadResult({ post, companyId, brandColors, onReset }: ThreadResultProps) {
  const thread = (post.contentVariants?.thread ?? []) as { text: string }[]
  return (
    <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-sky-400" />
          <span className="text-sm font-medium text-zinc-300">Thread</span>
          <span className="text-xs text-zinc-600">· {thread.length} tweets</span>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          New
        </button>
      </div>
      <XThreadEditor post={post} companyId={companyId} brandColors={brandColors} />
    </div>
  )
}

// ─── Main page client ─────────────────────────────────────────────────────────

export function XPageClient({ companyId, brandColors }: XPageClientProps) {
  const [voice, setVoice] = useState<XVoice>('personal')
  const [threadMode, setThreadMode] = useState(false)

  // Generate state
  const [topic, setTopic] = useState('')
  const [contentGoal, setContentGoal] = useState<ContentGoal>('engagement')
  const [postLength, setPostLength] = useState<PostLength>('short')
  const [additionalContext, setAdditionalContext] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Result state
  const [content, setContent] = useState('')
  const [imagePrompt, setImagePrompt] = useState<string | undefined>()
  const [isStreaming, setIsStreaming] = useState(false)
  const [threadPost, setThreadPost] = useState<GeneratedPost | null>(null)
  const [generationKey, setGenerationKey] = useState(0)
  const [activeVoice, setActiveVoice] = useState<XVoice>('personal')

  // History
  const [historyKey, setHistoryKey] = useState(0)

  const canGenerate = topic.trim().length > 0 && !loading
  const showThread = !!threadPost && postHasThread(threadPost)

  useEffect(() => {
    setContent('')
    setImagePrompt(undefined)
    setThreadPost(null)
    setError('')
    setGenerationKey(k => k + 1)
  }, [voice])

  async function doGenerate(params: {
    topic: string
    contentGoal: ContentGoal
    postLength: PostLength
    additionalContext?: string
    voice: XVoice
    threadMode: boolean
  }) {
    if (!params.topic.trim()) return
    const goal = normalizeContentGoal(params.contentGoal)
    setContentGoal(goal)
    setLoading(true)
    setError('')
    setContent('')
    setImagePrompt(undefined)
    setThreadPost(null)
    setActiveVoice(params.voice)
    setGenerationKey(k => k + 1)

    const ctx = buildAdditionalContext(params.voice, params.additionalContext ?? '')

    if (params.threadMode) {
      // Non-streaming thread generation
      try {
        const res = await fetch('/api/generate/content', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId,
            channel: 'x',
            topic: params.topic.trim(),
            contentGoal: goal,
            postLength: params.postLength,
            additionalContext: ctx,
            stream: false,
            threadMode: true,
          }),
        })
        if (!res.ok) {
          const data = await res.json() as { error?: string }
          setError(data.error ?? 'Generation failed')
          return
        }
        const post = await res.json() as GeneratedPost
        setThreadPost(post)
      } catch {
        setError('Network error — please try again')
      } finally {
        setLoading(false)
      }
      return
    }

    // Single tweet: streaming
    setIsStreaming(true)
    try {
      const res = await fetch('/api/generate/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          channel: 'x',
          topic: params.topic.trim(),
          contentGoal: goal,
          postLength: params.postLength,
          additionalContext: ctx,
          stream: true,
        }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        setError(data.error ?? 'Generation failed')
        setIsStreaming(false)
        return
      }
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let fullText = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        fullText += chunk
        const { content: body, imagePrompt: prompt } = splitImagePromptFromText(fullText)
        setContent(body)
        if (prompt) setImagePrompt(prompt)
      }
      const { content: body, imagePrompt: prompt } = splitImagePromptFromText(fullText)
      setContent(body)
      setImagePrompt(prompt)
      setIsStreaming(false)
    } catch {
      setError('Network error — please try again')
      setIsStreaming(false)
    } finally {
      setLoading(false)
    }
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    await doGenerate({ topic, contentGoal, postLength, additionalContext, voice, threadMode })
  }

  function handleIdeaGenerate(idea: PostIdea) {
    const goal = normalizeContentGoal(idea.angle)
    setTopic(idea.title)
    setContentGoal(goal)
    setAdditionalContext(idea.description)
    doGenerate({
      topic: idea.title,
      contentGoal: goal,
      postLength: 'short',
      additionalContext: idea.description,
      voice,
      threadMode,
    })
  }

  function handleReset() {
    setContent('')
    setImagePrompt(undefined)
    setThreadPost(null)
    setError('')
    setIsStreaming(false)
    setGenerationKey(k => k + 1)
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">

        {/* ─── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-zinc-700/30 border border-zinc-600/40 flex items-center justify-center">
              <XIcon className="w-4 h-4 text-zinc-200" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">X (Twitter)</h1>
              <p className="text-zinc-500 text-sm mt-0.5">
                {voice === 'personal'
                  ? 'Personal profile — opinionated, first-person, individual takes'
                  : 'Company account — brand voice, sharp and direct'}
              </p>
            </div>
          </div>

          {/* Voice toggle */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-600 hidden sm:block">Posting as</span>
            <div className="flex items-center bg-zinc-800/80 border border-zinc-700 rounded-xl p-1 gap-1">
              <button
                type="button"
                onClick={() => setVoice('personal')}
                className={cn(
                  'flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all',
                  voice === 'personal'
                    ? 'bg-zinc-600 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-700/50'
                )}
              >
                <User className="w-3.5 h-3.5" />
                Personal
              </button>
              <button
                type="button"
                onClick={() => setVoice('company')}
                className={cn(
                  'flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all',
                  voice === 'company'
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-700/50'
                )}
              >
                <Building2 className="w-3.5 h-3.5" />
                Company
              </button>
            </div>
          </div>
        </div>

        {/* ─── Voice context banner ────────────────────────────────────────── */}
        <div className={cn(
          'flex items-start gap-3 rounded-xl border px-4 py-3 mb-6 text-sm',
          voice === 'personal'
            ? 'bg-zinc-800/50 border-zinc-700/60 text-zinc-400'
            : 'bg-violet-900/10 border-violet-800/40 text-violet-300/80'
        )}>
          {voice === 'personal'
            ? <User className="w-4 h-4 shrink-0 mt-0.5 text-zinc-400" />
            : <Building2 className="w-4 h-4 shrink-0 mt-0.5 text-violet-400" />
          }
          <p>
            {voice === 'personal'
              ? 'Content will be direct, opinionated, and written in first-person "I" voice. Best for hot takes, personal insights, and founder perspective on your personal profile.'
              : 'Content will be written in company "we/our" voice while remaining sharp and direct. Best for product updates, company insights, and brand-led posts on your company account.'}
          </p>
        </div>

        {/* ─── Generate section ───────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

          {/* Left: form */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <form onSubmit={handleGenerate} className="space-y-5">

              {/* Topic + IdeaSpark */}
              <div className="space-y-1.5">
                <Label htmlFor="x-topic">What to write about</Label>
                <IdeaSpark
                  companyId={companyId}
                  selectedChannels={['x']}
                  onGenerate={handleIdeaGenerate}
                  disabled={loading}
                  voice={voice}
                />
                <Textarea
                  id="x-topic"
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  placeholder="e.g. Most AI agents fail because they skip the boring infrastructure"
                  rows={3}
                  required
                />
              </div>

              {/* Thread toggle */}
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => setThreadMode(v => !v)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all w-fit',
                    threadMode
                      ? 'border-sky-500 bg-sky-500/10 text-sky-300'
                      : 'border-zinc-700 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
                  )}
                >
                  <GitBranch className="w-3.5 h-3.5" />
                  {threadMode ? 'Thread mode on' : 'Thread mode'}
                </button>
                <p className="text-xs text-zinc-600">
                  {threadMode
                    ? 'Will generate a 3–7 tweet thread instead of a single tweet.'
                    : 'Toggle to generate a multi-tweet thread instead of a single post.'}
                </p>
              </div>

              {/* Content goal */}
              <div className="space-y-2">
                <Label>Content goal</Label>
                <div className="grid grid-cols-2 gap-2">
                  {GOALS.map(({ id, label, description }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setContentGoal(id)}
                      className={cn(
                        'text-left px-3 py-2.5 rounded-lg border text-sm transition-all',
                        contentGoal === id
                          ? 'border-violet-500 bg-violet-500/10 text-violet-300'
                          : 'border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-white'
                      )}
                    >
                      <div className="font-medium">{label}</div>
                      <div className="text-xs opacity-70 mt-0.5">{description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Length — hidden for single tweet since it's always ≤280 chars */}
              {threadMode && (
                <div className="space-y-2">
                  <Label>Thread length</Label>
                  <div className="flex gap-2">
                    {LENGTHS.map(({ id, label }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setPostLength(id)}
                        className={cn(
                          'flex-1 py-2 rounded-lg border text-sm font-medium transition-all',
                          postLength === id
                            ? 'border-violet-500 bg-violet-500/10 text-violet-300'
                            : 'border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-white'
                        )}
                      >
                        {label === 'Short' ? '3–4 tweets' : label === 'Medium' ? '4–5 tweets' : '6–7 tweets'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Additional context */}
              <div className="space-y-1.5">
                <Label htmlFor="x-context">
                  Additional context{' '}
                  <span className="text-zinc-500 font-normal text-xs">(optional)</span>
                </Label>
                <Textarea
                  id="x-context"
                  value={additionalContext}
                  onChange={e => setAdditionalContext(e.target.value)}
                  placeholder="Any specific angle, stat, or instruction…"
                  rows={2}
                />
              </div>

              <Button
                type="submit"
                disabled={loading || !canGenerate}
                className="w-full"
                size="lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {threadMode ? 'Writing thread…' : `Writing ${voice === 'personal' ? 'personal' : 'company'} tweet…`}
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    {threadMode
                      ? `Generate ${voice === 'personal' ? 'personal' : 'company'} thread`
                      : `Generate ${voice === 'personal' ? 'personal' : 'company'} tweet`}
                  </>
                )}
              </Button>

              {error && (
                <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-4 py-3">
                  {error}
                </p>
              )}
            </form>
          </div>

          {/* Right: preview */}
          <div className="sticky top-8 space-y-4">
            {showThread ? (
              <ThreadResult
                post={threadPost!}
                companyId={companyId}
                brandColors={brandColors}
                onReset={handleReset}
              />
            ) : (
              <PostPreview
                key={generationKey}
                channel="x"
                content={content}
                imagePrompt={imagePrompt}
                isStreaming={isStreaming}
                companyId={companyId}
                brandColors={brandColors}
                onReset={handleReset}
                generationParams={{ x_voice: activeVoice }}
                onSaved={() => setHistoryKey(k => k + 1)}
              />
            )}
          </div>
        </div>

        {/* ─── History ────────────────────────────────────────────────────── */}
        <XHistory companyId={companyId} refreshKey={historyKey} />
      </div>
    </div>
  )
}
