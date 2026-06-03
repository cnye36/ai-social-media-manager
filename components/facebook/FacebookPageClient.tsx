'use client'

import { useState, useEffect, useCallback } from 'react'
import { Sparkles, Loader2, User, Building2, History, RefreshCw, Copy, Check, Trash2, Pencil, CalendarClock, CircleCheck, Clock } from 'lucide-react'
import { FacebookIcon } from '@/components/ui/channel-icons'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { IdeaSpark } from '@/components/generate/IdeaSpark'
import { PostPreview } from '@/components/generate/PostPreview'
import { MediaPanel } from '@/components/generate/MediaPanel'
import { PostEditorModal } from '@/components/posts/PostEditorModal'
import { cn } from '@/lib/utils'
import { formatDistanceToNow, format } from 'date-fns'
import type { ContentGoal, PostLength } from '@/types/agents'
import type { Post, PostStatus } from '@/types/database'
import type { PostIdea } from '@/app/api/generate/ideas/route'
import { normalizeContentGoal } from '@/lib/content/content-goal'
import { splitImagePromptFromText, postBodyForPublish } from '@/lib/generate/image-prompt'

// ─── Types ───────────────────────────────────────────────────────────────────

type FacebookVoice = 'personal' | 'company'

interface FacebookPageClientProps {
  companyId: string
  brandColors?: { primary?: string; accent?: string }
}

// ─── Constants ───────────────────────────────────────────────────────────────

const GOALS: { id: ContentGoal; label: string; description: string }[] = [
  { id: 'awareness', label: 'Awareness', description: 'Introduce & attract new audiences' },
  { id: 'engagement', label: 'Engagement', description: 'Spark comments & shares' },
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

function buildAdditionalContext(voice: FacebookVoice, userContext: string): string {
  const voiceInstruction =
    voice === 'personal'
      ? 'VOICE: Write as a personal Facebook post from an individual. Use first-person "I" throughout. Be warm, relatable, and conversational as if sharing with friends and family. Personal stories and authentic emotion work well.'
      : 'VOICE: Write as a company Facebook page post. Use "we" and "our" language. Keep the tone warm and community-focused, not corporate. Speak as the brand engaging with its community and customers.'
  return userContext.trim() ? `${voiceInstruction}\n\n${userContext}` : voiceInstruction
}

// ─── History section ─────────────────────────────────────────────────────────

interface FacebookHistoryProps {
  companyId: string
  refreshKey: number
}

function FacebookHistory({ companyId, refreshKey }: FacebookHistoryProps) {
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
      const res = await fetch(`/api/posts?companyId=${companyId}&channel=facebook`)
      if (!res.ok) throw new Error('Failed to load posts')
      const data = await res.json() as Post[]
      setPosts(data)
    } catch {
      setError('Could not load Facebook posts')
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

  const getVoice = (post: Post): FacebookVoice | null => {
    const v = post.generation_params?.facebook_voice
    return v === 'personal' || v === 'company' ? v : null
  }

  return (
    <div className="mt-12">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <History className="w-4 h-4 text-zinc-500" />
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">Recent Facebook Posts</h2>
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
          <FacebookIcon className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
          <p className="text-sm text-zinc-500">No Facebook posts yet</p>
          <p className="text-xs text-zinc-600 mt-1">Generate your first post above</p>
        </div>
      )}

      {posts.length > 0 && (
        <div className="space-y-2">
          {posts.map(post => {
            const postVoice = getVoice(post)
            const body = postBodyForPublish(post.content)
            const preview = body.length > 160
              ? body.slice(0, 160).trimEnd() + '…'
              : body
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
                    <div title="Personal post" className="w-7 h-7 rounded-full bg-blue-900/40 border border-blue-700/40 flex items-center justify-center">
                      <User className="w-3.5 h-3.5 text-blue-400" />
                    </div>
                  ) : postVoice === 'company' ? (
                    <div title="Company page post" className="w-7 h-7 rounded-full bg-violet-900/40 border border-violet-700/40 flex items-center justify-center">
                      <Building2 className="w-3.5 h-3.5 text-violet-400" />
                    </div>
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                      <FacebookIcon className="w-3.5 h-3.5 text-zinc-500" />
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
                          ? 'text-blue-400 bg-blue-900/20 border-blue-700/30'
                          : 'text-violet-400 bg-violet-900/20 border-violet-700/30'
                      )}>
                        {postVoice === 'personal' ? 'Personal' : 'Company Page'}
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

// ─── Main page client ─────────────────────────────────────────────────────────

export function FacebookPageClient({ companyId, brandColors }: FacebookPageClientProps) {
  const [voice, setVoice] = useState<FacebookVoice>('company')

  // Generate state
  const [topic, setTopic] = useState('')
  const [contentGoal, setContentGoal] = useState<ContentGoal>('engagement')
  const [postLength, setPostLength] = useState<PostLength>('medium')
  const [additionalContext, setAdditionalContext] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Streaming / preview state
  const [content, setContent] = useState('')
  const [imagePrompt, setImagePrompt] = useState<string | undefined>()
  const [isStreaming, setIsStreaming] = useState(false)
  const [generationKey, setGenerationKey] = useState(0)
  const [activeVoice, setActiveVoice] = useState<FacebookVoice>('company')

  // History refresh
  const [historyKey, setHistoryKey] = useState(0)

  const canGenerate = topic.trim().length > 0 && !loading

  useEffect(() => {
    setContent('')
    setImagePrompt(undefined)
    setError('')
    setGenerationKey(k => k + 1)
  }, [voice])

  async function doGenerate(params: {
    topic: string
    contentGoal: ContentGoal
    postLength: PostLength
    additionalContext?: string
    voice: FacebookVoice
  }) {
    if (!params.topic.trim()) return
    const goal = normalizeContentGoal(params.contentGoal)
    setContentGoal(goal)
    setLoading(true)
    setError('')
    setContent('')
    setImagePrompt(undefined)
    setIsStreaming(true)
    setActiveVoice(params.voice)
    setGenerationKey(k => k + 1)

    const ctx = buildAdditionalContext(params.voice, params.additionalContext ?? '')

    try {
      const res = await fetch('/api/generate/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          channel: 'facebook',
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
        setLoading(false)
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
    await doGenerate({ topic, contentGoal, postLength, additionalContext, voice })
  }

  function handleIdeaGenerate(idea: PostIdea) {
    const goal = normalizeContentGoal(idea.angle)
    setTopic(idea.title)
    setContentGoal(goal)
    setAdditionalContext(idea.description)
    doGenerate({
      topic: idea.title,
      contentGoal: goal,
      postLength: 'medium',
      additionalContext: idea.description,
      voice,
    })
  }

  function handleReset() {
    setContent('')
    setImagePrompt(undefined)
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
            <div className="w-9 h-9 rounded-xl bg-blue-700/20 border border-blue-600/30 flex items-center justify-center">
              <FacebookIcon className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Facebook</h1>
              <p className="text-zinc-500 text-sm mt-0.5">
                {voice === 'personal'
                  ? 'Personal profile — warm, story-driven, authentic individual posts'
                  : 'Company page — community-focused brand voice, warm and engaging'}
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
                    ? 'bg-blue-600 text-white shadow-sm'
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
                Company Page
              </button>
            </div>
          </div>
        </div>

        {/* ─── Voice context banner ────────────────────────────────────────── */}
        <div className={cn(
          'flex items-start gap-3 rounded-xl border px-4 py-3 mb-6 text-sm',
          voice === 'personal'
            ? 'bg-blue-900/10 border-blue-800/40 text-blue-300/80'
            : 'bg-violet-900/10 border-violet-800/40 text-violet-300/80'
        )}>
          {voice === 'personal'
            ? <User className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
            : <Building2 className="w-4 h-4 shrink-0 mt-0.5 text-violet-400" />
          }
          <p>
            {voice === 'personal'
              ? 'Content will be warm, relatable, and first-person "I" voice. Best for personal stories, life updates, and authentic community connection on your personal profile.'
              : 'Content will use "we/our" brand voice while staying warm and community-focused. Best for behind-the-scenes content, client stories, team spotlights, and community engagement on your company page.'}
          </p>
        </div>

        {/* ─── Generate section ───────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

          {/* Left: form */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <form onSubmit={handleGenerate} className="space-y-5">

              {/* Topic + IdeaSpark */}
              <div className="space-y-1.5">
                <Label htmlFor="fb-topic">What to write about</Label>
                <IdeaSpark
                  companyId={companyId}
                  selectedChannels={['facebook']}
                  onGenerate={handleIdeaGenerate}
                  disabled={loading}
                  voice={voice}
                />
                <Textarea
                  id="fb-topic"
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  placeholder="e.g. A client story about how we saved them 20 hours a week with AI"
                  rows={3}
                  required
                />
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

              {/* Length */}
              <div className="space-y-2">
                <Label>Length</Label>
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
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Additional context */}
              <div className="space-y-1.5">
                <Label htmlFor="fb-context">
                  Additional context{' '}
                  <span className="text-zinc-500 font-normal text-xs">(optional)</span>
                </Label>
                <Textarea
                  id="fb-context"
                  value={additionalContext}
                  onChange={e => setAdditionalContext(e.target.value)}
                  placeholder="Any specific story, angle, or details to include…"
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
                    Writing {voice === 'personal' ? 'personal' : 'company'} post…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate {voice === 'personal' ? 'personal' : 'company page'} post
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
            <PostPreview
              key={generationKey}
              channel="facebook"
              content={content}
              imagePrompt={imagePrompt}
              isStreaming={isStreaming}
              companyId={companyId}
              brandColors={brandColors}
              onReset={handleReset}
              generationParams={{ facebook_voice: activeVoice }}
              onSaved={() => setHistoryKey(k => k + 1)}
            />
            {content && !isStreaming && (
              <MediaPanel
                key={`media-${generationKey}`}
                postContent={content}
                companyId={companyId}
                channel="facebook"
                brandColors={brandColors}
                suggestedPrompt={imagePrompt}
                onAccept={() => {}}
              />
            )}
          </div>
        </div>

        {/* ─── History ────────────────────────────────────────────────────── */}
        <FacebookHistory companyId={companyId} refreshKey={historyKey} />
      </div>
    </div>
  )
}
