'use client'

import { useState } from 'react'
import { Sparkles, Loader2, GitBranch } from 'lucide-react'
import { LinkedInIcon, XIcon, FacebookIcon } from '@/components/ui/channel-icons'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { IdeaSpark } from './IdeaSpark'
import type { Channel } from '@/types/database'
import type { ContentGoal, GeneratedPost, PostLength } from '@/types/agents'
import type { PostIdea } from '@/app/api/generate/ideas/route'

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
  const [selectedChannels, setSelectedChannels] = useState<Channel[]>(['linkedin'])
  const [topic, setTopic] = useState('')
  const [contentGoal, setContentGoal] = useState<ContentGoal>('awareness')
  const [postLength, setPostLength] = useState<PostLength>('medium')
  const [additionalContext, setAdditionalContext] = useState('')
  const [loading, setLoading] = useState(false)
  const [threadMode, setThreadMode] = useState(false)

  const isXOnly = selectedChannels.length === 1 && selectedChannels[0] === 'x'

  function toggleChannel(channel: Channel) {
    setSelectedChannels(prev => {
      const next = prev.includes(channel)
        ? prev.filter(c => c !== channel)
        : [...prev, channel]
      if (!next.includes('x') || next.length > 1) setThreadMode(false)
      return next
    })
  }

  async function doGenerate(params: {
    topic: string
    contentGoal: ContentGoal
    postLength: PostLength
    channels: Channel[]
    additionalContext?: string
    useThread?: boolean
  }) {
    const { topic: t, contentGoal: goal, postLength: length, channels, additionalContext: ctx, useThread = false } = params
    if (!t.trim() || channels.length === 0) return

    // Sync form state so the fields reflect what's generating
    setTopic(t)
    setContentGoal(goal)
    setSelectedChannels(channels)
    if (ctx !== undefined) setAdditionalContext(ctx)
    setLoading(true)

    const isXOnlyMode = channels.length === 1 && channels[0] === 'x'

    // Thread mode: always non-streaming
    if (isXOnlyMode && useThread) {
      try {
        const res = await fetch('/api/generate/content', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId, channel: 'x',
            topic: t.trim(),
            contentGoal: goal, postLength: length,
            additionalContext: ctx?.trim() || undefined,
            stream: false,
            threadMode: true,
          }),
        })
        if (!res.ok) {
          const d = await res.json() as { error?: string }
          onBatchGenerated?.([], [d.error ?? 'Thread generation failed'])
        } else {
          const post = await res.json() as GeneratedPost
          onBatchGenerated?.([post], [])
        }
      } catch {
        onBatchGenerated?.([], ['Network error — please try again'])
      } finally {
        setLoading(false)
      }
      return
    }

    // Single channel: streaming
    if (channels.length === 1) {
      const channel = channels[0]
      onStream(channel)
      try {
        const res = await fetch('/api/generate/content', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId, channel,
            topic: t.trim(),
            contentGoal: goal, postLength: length,
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
        const marker = '\n--\nIMAGE_PROMPT:'
        const idx = fullText.indexOf(marker)
        onDone(idx !== -1 ? fullText.slice(idx + marker.length).trim() : undefined)
      } catch {
        onError('Network error — please try again')
      } finally {
        setLoading(false)
      }
      return
    }

    // Multi-channel: parallel batch
    try {
      const results = await Promise.allSettled(
        channels.map(channel =>
          fetch('/api/generate/content', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              companyId, channel,
              topic: t.trim(),
              contentGoal: goal, postLength: length,
              additionalContext: ctx?.trim() || undefined,
              stream: false,
            }),
          }).then(async res => {
            if (!res.ok) {
              const d = await res.json() as { error?: string }
              throw new Error(d.error ?? `${channel} generation failed`)
            }
            return res.json() as Promise<GeneratedPost>
          })
        )
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
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    await doGenerate({
      topic,
      contentGoal,
      postLength,
      channels: selectedChannels,
      additionalContext: additionalContext.trim() || undefined,
      useThread: isXOnly && threadMode,
    })
  }

  function handleIdeaGenerate(idea: PostIdea) {
    const validChannels = idea.suggestedChannels.filter((ch): ch is Channel =>
      CHANNELS.some(c => c.id === ch)
    )
    doGenerate({
      topic: idea.title,
      contentGoal: idea.angle,
      postLength: 'medium',
      channels: validChannels.length > 0 ? validChannels : ['linkedin'],
      additionalContext: idea.description,
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
          Pick one for live streaming preview, or multiple to generate all at once
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
        {isXOnly && (
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
            Thread
          </button>
        )}
      </div>

      {/* Topic */}
      <div className="space-y-1.5">
        <Label htmlFor="topic">What to write about</Label>
        <IdeaSpark
          companyId={companyId}
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
            {isMulti ? `Generating ${selectedChannels.length} posts…` : 'Writing…'}
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            {isMulti ? `Generate for ${selectedChannels.length} channels` : 'Generate post'}
          </>
        )}
      </Button>
    </form>
  )
}
