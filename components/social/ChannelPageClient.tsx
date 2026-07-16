'use client'

import { useState, useEffect } from 'react'
import { Sparkles, Loader2, User, Building2, RefreshCw, GitBranch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { IdeaSpark } from '@/components/generate/IdeaSpark'
import { PostPreview } from '@/components/generate/PostPreview'
import { MediaPanel } from '@/components/generate/MediaPanel'
import { XThreadEditor } from '@/components/generate/XThreadEditor'
import { cn } from '@/lib/utils'
import { postHasThread } from '@/lib/generate/x-thread'
import type { ContentGoal, GeneratedPost, PostLength } from '@/types/agents'
import type { PostIdea } from '@/app/api/generate/ideas/route'
import { normalizeContentGoal } from '@/lib/content/content-goal'
import { splitImagePromptFromText } from '@/lib/generate/image-prompt'
import { COMPANY_ACCENT, type ChannelConfig, type ChannelVoice } from '@/lib/social/channel-config'
import { buildGoals, LENGTHS, buildAdditionalContext } from './constants'
import { ChannelHistory } from './ChannelHistory'

interface ChannelPageClientProps {
  config: ChannelConfig
  companyId: string
  brandColors?: { primary?: string; accent?: string }
}

// ─── Thread result viewer (X only) ───────────────────────────────────────────

interface ThreadResultProps {
  post: GeneratedPost
  companyId: string
  brandColors?: { primary?: string; accent?: string }
  voice: ChannelVoice
  onReset: () => void
  onSaved?: () => void
}

function ThreadResult({ post, companyId, brandColors, voice, onReset, onSaved }: ThreadResultProps) {
  const thread = (post.contentVariants?.thread ?? []) as { text: string }[]
  return (
    <div className="border border-edge rounded-xl overflow-hidden bg-surface-1">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-edge bg-surface-1/50">
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
      <XThreadEditor post={post} companyId={companyId} brandColors={brandColors} voice={voice} onSaved={onSaved} />
    </div>
  )
}

// ─── Main channel client ──────────────────────────────────────────────────────

export function ChannelPageClient({ config, companyId, brandColors }: ChannelPageClientProps) {
  const { Icon } = config
  const GOALS = buildGoals(config)

  const [voice, setVoice] = useState<ChannelVoice>(config.defaults.voice)
  const [threadMode, setThreadMode] = useState(false)

  // Generate state
  const [topic, setTopic] = useState('')
  const [contentGoal, setContentGoal] = useState<ContentGoal>(config.defaults.contentGoal)
  const [postLength, setPostLength] = useState<PostLength>(config.defaults.postLength)
  const [additionalContext, setAdditionalContext] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Result state
  const [content, setContent] = useState('')
  const [imagePrompt, setImagePrompt] = useState<string | undefined>()
  const [isStreaming, setIsStreaming] = useState(false)
  const [threadPost, setThreadPost] = useState<GeneratedPost | null>(null)
  const [generationKey, setGenerationKey] = useState(0)
  const [activeVoice, setActiveVoice] = useState<ChannelVoice>(config.defaults.voice)

  // History refresh
  const [historyKey, setHistoryKey] = useState(0)

  const canGenerate = topic.trim().length > 0 && !loading
  const showThread = !!threadPost && postHasThread(threadPost)

  // When voice changes mid-session, reset the preview so it doesn't show stale content
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
    voice: ChannelVoice
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

    const ctx = buildAdditionalContext(config, params.voice, params.additionalContext ?? '')

    if (params.threadMode && config.supportsThreads) {
      // Non-streaming thread generation
      try {
        const res = await fetch('/api/generate/content', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId,
            channel: config.id,
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

    // Single post: streaming
    setIsStreaming(true)
    try {
      const res = await fetch('/api/generate/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          channel: config.id,
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
      postLength: config.defaults.ideaPostLength,
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
    <div className="pt-8">
      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className={cn('w-9 h-9 rounded-xl border flex items-center justify-center', config.headerTile)}>
            <Icon className={cn('w-4 h-4', config.headerIcon)} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-white">{config.name}</h1>
            <p className="text-zinc-500 text-sm mt-0.5">{config.copy.subtitle[voice]}</p>
          </div>
        </div>

        {/* Voice toggle */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-600 hidden sm:block">Posting as</span>
          <div className="flex items-center bg-surface-2/80 border border-edge rounded-xl p-1 gap-1">
            <button
              type="button"
              onClick={() => setVoice('personal')}
              className={cn(
                'flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50',
                voice === 'personal'
                  ? config.personal.toggleActive
                  : 'text-zinc-400 hover:text-white hover:bg-surface-3/60'
              )}
            >
              <User className="w-3.5 h-3.5" />
              Personal
            </button>
            <button
              type="button"
              onClick={() => setVoice('company')}
              className={cn(
                'flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50',
                voice === 'company'
                  ? COMPANY_ACCENT.toggleActive
                  : 'text-zinc-400 hover:text-white hover:bg-surface-3/60'
              )}
            >
              <Building2 className="w-3.5 h-3.5" />
              {config.companyVoiceLabel}
            </button>
          </div>
        </div>
      </div>

      {/* ─── Voice context banner ────────────────────────────────────────── */}
      <div className={cn(
        'flex items-start gap-3 rounded-xl border px-4 py-3 mb-6 text-sm',
        voice === 'personal' ? config.personal.banner : COMPANY_ACCENT.banner
      )}>
        {voice === 'personal'
          ? <User className={cn('w-4 h-4 shrink-0 mt-0.5', config.personal.bannerIcon)} />
          : <Building2 className={cn('w-4 h-4 shrink-0 mt-0.5', COMPANY_ACCENT.bannerIcon)} />
        }
        <p>{config.copy.banner[voice]}</p>
      </div>

      {/* ─── Generate section ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

        {/* Left: form */}
        <div className="bg-surface-1 border border-edge rounded-xl p-6">
          <form onSubmit={handleGenerate} className="space-y-5">

            {/* Topic + IdeaSpark */}
            <div className="space-y-1.5">
              <Label htmlFor={`${config.id}-topic`}>What to write about</Label>
              <IdeaSpark
                companyId={companyId}
                selectedChannels={[config.id]}
                onGenerate={handleIdeaGenerate}
                disabled={loading}
                voice={voice}
              />
              <Textarea
                id={`${config.id}-topic`}
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder={config.copy.topicPlaceholder}
                rows={3}
                required
              />
            </div>

            {/* Thread toggle (X only) */}
            {config.supportsThreads && (
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => setThreadMode(v => !v)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all w-fit',
                    threadMode
                      ? 'border-sky-500 bg-sky-500/10 text-sky-300'
                      : 'border-edge-strong text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
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
            )}

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
                        : 'border-edge-strong text-zinc-400 hover:border-zinc-600 hover:text-white'
                    )}
                  >
                    <div className="font-medium">{label}</div>
                    <div className="text-xs opacity-70 mt-0.5">{description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Length — for X, only shown in thread mode (single tweets are always ≤280 chars) */}
            {(!config.supportsThreads || threadMode) && (
              <div className="space-y-2">
                <Label>{threadMode ? 'Thread length' : 'Length'}</Label>
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
                          : 'border-edge-strong text-zinc-400 hover:border-zinc-600 hover:text-white'
                      )}
                    >
                      {threadMode
                        ? label === 'Short' ? '3–4 tweets' : label === 'Medium' ? '4–5 tweets' : '6–7 tweets'
                        : label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Additional context */}
            <div className="space-y-1.5">
              <Label htmlFor={`${config.id}-context`}>
                Additional context{' '}
                <span className="text-zinc-500 font-normal text-xs">(optional)</span>
              </Label>
              <Textarea
                id={`${config.id}-context`}
                value={additionalContext}
                onChange={e => setAdditionalContext(e.target.value)}
                placeholder={config.copy.contextPlaceholder}
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
                  {threadMode ? 'Writing thread…' : config.copy.writing[voice]}
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  {threadMode
                    ? `Generate ${voice === 'personal' ? 'personal' : 'company'} thread`
                    : config.copy.generate[voice]}
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
              voice={activeVoice}
              onReset={handleReset}
              onSaved={() => setHistoryKey(k => k + 1)}
            />
          ) : (
            <PostPreview
              key={generationKey}
              channel={config.id}
              content={content}
              imagePrompt={imagePrompt}
              isStreaming={isStreaming}
              companyId={companyId}
              brandColors={brandColors}
              onReset={handleReset}
              generationParams={{ [config.voiceParamKey]: activeVoice }}
              onSaved={() => setHistoryKey(k => k + 1)}
            />
          )}
          {config.showMediaPanel && content && !isStreaming && (
            <MediaPanel
              key={`media-${generationKey}`}
              postContent={content}
              companyId={companyId}
              channel={config.id}
              brandColors={brandColors}
              suggestedPrompt={imagePrompt}
              onAccept={() => {}}
            />
          )}
        </div>
      </div>

      {/* ─── History ────────────────────────────────────────────────────── */}
      <ChannelHistory config={config} companyId={companyId} refreshKey={historyKey} />
    </div>
  )
}
