'use client'

import { useState, useEffect } from 'react'
import { Sparkles, Loader2, GitBranch } from 'lucide-react'
import { LinkedInIcon, XIcon, FacebookIcon } from '@/components/ui/channel-icons'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { IdeaSpark } from './IdeaSpark'
import { resolveXThreadMode } from '@/lib/generate/x-thread'
import type { Channel } from '@/types/database'
import type { ContentGoal, GeneratedPost, PostLength } from '@/types/agents'
import type { PostIdea } from '@/app/api/generate/ideas/route'
import { normalizeContentGoal } from '@/lib/content/content-goal'
import { splitImagePromptFromText } from '@/lib/generate/image-prompt'

const CHANNELS: { id: Channel; label: string; icon: React.ReactNode; hint: string }[] = [
  { id: 'linkedin', label: 'LinkedIn', icon: <LinkedInIcon className="w-4 h-4" />, hint: 'Thought leadership, 300–1300 chars' },
  { id: 'x', label: 'X', icon: <XIcon className="w-4 h-4" />, hint: '≤280 chars, punchy hook' },
  { id: 'facebook', label: 'Facebook', icon: <FacebookIcon className="w-4 h-4" />, hint: 'Friendly, story-driven' },
]

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

const CHANNEL_IDS = CHANNELS.map(c => c.id)

function channelsStorageKey(companyId: string) {
  return `generate-channels-${companyId}`
}

function loadStoredChannels(companyId: string): Channel[] {
  try {
    const raw = sessionStorage.getItem(channelsStorageKey(companyId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((ch): ch is Channel => CHANNEL_IDS.includes(ch as Channel))
  } catch {
    return []
  }
}

interface GenerateFormProps {
  companyId: string
  onStream: (channel: Channel) => void
  onChunk: (text: string) => void
  onDone: (imagePrompt?: string) => void
  onError: (msg: string) => void
  onBatchGenerated?: (posts: GeneratedPost[], errors: string[]) => void
}

export function GenerateForm({
  companyId, onStream, onChunk, onDone, onError, onBatchGenerated,
}: GenerateFormProps) {
  const [selectedChannels, setSelectedChannels] = useState<Channel[]>([])
  const [topic, setTopic] = useState('')
  const [contentGoal, setContentGoal] = useState<ContentGoal>('awareness')
  const [postLength, setPostLength] = useState<PostLength>('medium')
  const [additionalContext, setAdditionalContext] = useState('')
  const [loading, setLoading] = useState(false)
  const [threadMode, setThreadMode] = useState(false)

  useEffect(() => {
    setSelectedChannels(loadStoredChannels(companyId))
  }, [companyId])

  useEffect(() => {
    sessionStorage.setItem(channelsStorageKey(companyId), JSON.stringify(selectedChannels))
  }, [companyId, selectedChannels])

  const hasX = selectedChannels.includes('x')

  function toggleChannel(channel: Channel) {
    setSelectedChannels(prev => {
      const next = prev.includes(channel)
        ? prev.filter(c => c !== channel)
        : [...prev, channel]
      if (!next.includes('x')) setThreadMode(false)
      return next
    })
  }

  async function fetchChannelPost(
    channel: Channel,
    opts: {
      topic: string
      contentGoal: ContentGoal
      postLength: PostLength
      additionalContext?: string
      xThread: boolean
    },
  ): Promise<GeneratedPost> {
    const res = await fetch('/api/generate/content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId,
        channel,
        topic: opts.topic.trim(),
        contentGoal: opts.contentGoal,
        postLength: opts.postLength,
        additionalContext: opts.additionalContext,
        stream: false,
        threadMode: channel === 'x' && opts.xThread,
      }),
    })
    if (!res.ok) {
      const d = await res.json() as { error?: string }
      throw new Error(d.error ?? `${channel} generation failed`)
    }
    return res.json() as Promise<GeneratedPost>
  }

  async function doGenerate(params: {
    topic: string
    contentGoal: ContentGoal
    postLength: PostLength
    channels: Channel[]
    additionalContext?: string
    useXThread?: boolean
  }) {
    const { topic: t, postLength: length, channels, additionalContext: ctx, useXThread = false } = params
    if (!t.trim() || channels.length === 0) return

    const goal = normalizeContentGoal(params.contentGoal)
    setTopic(t)
    setContentGoal(goal)
    if (ctx !== undefined) setAdditionalContext(ctx)
    setLoading(true)

    const xThread = useXThread

    // X threads (and any multi-channel run) use non-streaming batch delivery
    if (xThread || channels.length > 1) {
      try {
        const results = await Promise.allSettled(
          channels.map(channel =>
            fetchChannelPost(channel, {
              topic: t,
              contentGoal: goal,
              postLength: length,
              additionalContext: ctx?.trim() || undefined,
              xThread,
            }),
          ),
        )

        const posts = results
          .filter((r): r is PromiseFulfilledResult<GeneratedPost> => r.status === 'fulfilled')
          .map(r => r.value)
        const errors = results
          .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
          .map(r => (r.reason as Error)?.message ?? 'Unknown error')

        onBatchGenerated?.(posts, errors)
      } catch {
        onBatchGenerated?.([], ['Network error — please try again'])
      } finally {
        setLoading(false)
      }
      return
    }

    // Single channel, single tweet: streaming preview
    const channel = channels[0]
    onStream(channel)
    try {
      const res = await fetch('/api/generate/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          channel,
          topic: t.trim(),
          contentGoal: goal,
          postLength: length,
          additionalContext: ctx?.trim() || undefined,
          stream: true,
        }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        onError(data.error ?? 'Generation failed')
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
        onChunk(chunk)
      }
      const { imagePrompt } = splitImagePromptFromText(fullText)
      onDone(imagePrompt)
    } catch {
      onError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    await doGenerate({
      topic,
      contentGoal,
      postLength,
      channels: selectedChannels,
      additionalContext: additionalContext.trim() || undefined,
      useXThread: resolveXThreadMode(selectedChannels, threadMode),
    })
  }

  function handleIdeaGenerate(idea: PostIdea) {
    if (selectedChannels.length === 0) {
      onError('Select at least one channel before generating from an idea')
      return
    }
    const useXThread = resolveXThreadMode(selectedChannels, threadMode, idea)
    if (useXThread) setThreadMode(true)

    const goal = normalizeContentGoal(idea.angle)
    setTopic(idea.title)
    setContentGoal(goal)
    setAdditionalContext(idea.description)
    doGenerate({
      topic: idea.title,
      contentGoal: goal,
      postLength: 'medium',
      channels: selectedChannels,
      additionalContext: idea.description,
      useXThread,
    })
  }

  const canGenerate = topic.trim().length > 0 && selectedChannels.length > 0
  const isMulti = selectedChannels.length > 1

  return (
    <form onSubmit={handleGenerate} className="space-y-6">
      {/* Channels */}
      <div className="space-y-2">
        <Label>Channels</Label>
        <p className="text-xs text-zinc-500">
          Only toggled channels are generated. One channel streams live; multiple run in parallel.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {CHANNELS.map(({ id, label, icon, hint }) => {
            const active = selectedChannels.includes(id)
            return (
              <button
                key={id}
                type="button"
                title={hint}
                onClick={() => toggleChannel(id)}
                className={cn(
                  'flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm font-medium transition-all',
                  active
                    ? 'border-violet-500 bg-violet-500/10 text-violet-300'
                    : 'border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-white'
                )}
              >
                {icon}
                {label}
              </button>
            )
          })}
        </div>
        {selectedChannels.length === 0 && (
          <p className="text-xs text-red-400">Select at least one channel</p>
        )}
        {hasX && (
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => setThreadMode(v => !v)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all w-fit',
                threadMode
                  ? 'border-sky-500 bg-sky-500/10 text-sky-300'
                  : 'border-zinc-700 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300',
              )}
            >
              <GitBranch className="w-3.5 h-3.5" />
              X thread
            </button>
            <p className="text-xs text-zinc-600">
              {isMulti
                ? 'Generates a thread for X plus posts for your other channels.'
                : 'Multi-tweet thread instead of a single post.'}
            </p>
          </div>
        )}
      </div>

      {/* Topic */}
      <div className="space-y-1.5">
        <Label htmlFor="topic">What to write about</Label>
        <IdeaSpark
          companyId={companyId}
          selectedChannels={selectedChannels}
          onGenerate={handleIdeaGenerate}
          disabled={loading}
        />
        <Textarea
          id="topic"
          value={topic}
          onChange={e => setTopic(e.target.value)}
          placeholder="e.g. We just launched our new pricing plan that includes a free tier"
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
        <Label htmlFor="context">
          Additional context <span className="text-zinc-500 font-normal text-xs">(optional)</span>
        </Label>
        <Textarea
          id="context"
          value={additionalContext}
          onChange={e => setAdditionalContext(e.target.value)}
          placeholder="Any specific angle, data point, or instruction for the AI..."
          rows={2}
        />
      </div>

      <Button type="submit" disabled={loading || !canGenerate} className="w-full" size="lg">
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {isMulti
              ? threadMode && hasX
                ? `Generating ${selectedChannels.length} (X thread)…`
                : `Generating ${selectedChannels.length} posts…`
              : threadMode && hasX
                ? 'Writing thread…'
                : 'Writing…'}
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            {isMulti
              ? threadMode && hasX
                ? `Generate for ${selectedChannels.length} (X thread)`
                : `Generate for ${selectedChannels.length} channels`
              : threadMode && hasX
                ? 'Generate thread'
                : 'Generate post'}
          </>
        )}
      </Button>
    </form>
  )
}
