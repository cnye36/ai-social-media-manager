'use client'

import { useState } from 'react'
import { Sparkles, Copy, Check, Loader2 } from 'lucide-react'
import { LinkedInIcon, XIcon, RedditIcon, FacebookIcon } from '@/components/ui/channel-icons'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Channel, Post } from '@/types/database'
import type { ContentGoal, PostLength } from '@/types/agents'

const CHANNELS: { id: Channel; label: string; icon: React.ReactNode; hint: string }[] = [
  { id: 'linkedin', label: 'LinkedIn', icon: <LinkedInIcon className="w-4 h-4" />, hint: 'Thought leadership, 300–1300 chars' },
  { id: 'x', label: 'X', icon: <XIcon className="w-4 h-4" />, hint: '≤280 chars, punchy hook' },
  { id: 'reddit', label: 'Reddit', icon: <RedditIcon className="w-4 h-4" />, hint: 'Authentic, community-first' },
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
  onBatchComplete?: (posts: Post[], errors: string[]) => void
}

export function GenerateForm({
  companyId,
  onStream,
  onChunk,
  onDone,
  onError,
  onBatchComplete,
}: GenerateFormProps) {
  const [selectedChannels, setSelectedChannels] = useState<Channel[]>(['linkedin'])
  const [topic, setTopic] = useState('')
  const [contentGoal, setContentGoal] = useState<ContentGoal>('awareness')
  const [postLength, setPostLength] = useState<PostLength>('medium')
  const [additionalContext, setAdditionalContext] = useState('')
  const [loading, setLoading] = useState(false)
  const [batchPosts, setBatchPosts] = useState<Post[]>([])
  const [batchErrors, setBatchErrors] = useState<string[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)

  function toggleChannel(channel: Channel) {
    setSelectedChannels(prev =>
      prev.includes(channel)
        ? prev.filter(c => c !== channel)
        : [...prev, channel]
    )
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    if (!topic.trim() || selectedChannels.length === 0) return

    setLoading(true)
    setBatchPosts([])
    setBatchErrors([])

    if (selectedChannels.length === 1) {
      const channel = selectedChannels[0]
      onStream(channel)

      try {
        const res = await fetch('/api/generate/content', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId,
            channel,
            topic: topic.trim(),
            contentGoal,
            postLength,
            additionalContext: additionalContext.trim() || undefined,
            stream: true,
          }),
        })

        if (!res.ok) {
          const data = await res.json()
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
        const imagePrompt = idx !== -1 ? fullText.slice(idx + marker.length).trim() : undefined
        onDone(imagePrompt)
      } catch {
        onError('Network error — please try again')
      } finally {
        setLoading(false)
      }
      return
    }

    // Multi-channel: batch generate and save drafts
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          topic: topic.trim(),
          channels: selectedChannels,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        const errs = [data.error ?? 'Generation failed']
        setBatchErrors(errs)
        onBatchComplete?.([], errs)
      } else {
        const posts = (data.posts ?? []) as Post[]
        const errors = (data.errors ?? []) as string[]
        setBatchPosts(posts)
        setBatchErrors(errors)
        onBatchComplete?.(posts, errors)
      }
    } catch {
      const errs = ['Network error — please try again']
      setBatchErrors(errs)
      onBatchComplete?.([], errs)
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy(post: Post) {
    await navigator.clipboard.writeText(post.content)
    setCopiedId(post.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const canGenerate = topic.trim().length > 0 && selectedChannels.length > 0
  const isMulti = selectedChannels.length > 1

  return (
    <form onSubmit={handleGenerate} className="space-y-6">
      <div className="space-y-2">
        <Label>Channels</Label>
        <p className="text-xs text-zinc-500">
          Select one for live preview, or multiple to generate drafts for each platform
        </p>
        <div className="grid grid-cols-2 gap-2">
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
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="topic">What to write about</Label>
        <Textarea
          id="topic"
          value={topic}
          onChange={e => setTopic(e.target.value)}
          placeholder="e.g. We just launched our new pricing plan that includes a free tier"
          rows={3}
          required
        />
      </div>

      {!isMulti && (
        <>
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
        </>
      )}

      <Button type="submit" disabled={loading || !canGenerate} className="w-full" size="lg">
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {isMulti
              ? `Generating ${selectedChannels.length} posts…`
              : 'Writing…'}
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            {isMulti
              ? `Generate for ${selectedChannels.length} channels`
              : 'Generate post'}
          </>
        )}
      </Button>

      {batchErrors.length > 0 && (
        <div className="rounded-lg border border-red-800 bg-red-900/20 p-4 space-y-1">
          {batchErrors.map((err, i) => (
            <p key={i} className="text-sm text-red-300">{err}</p>
          ))}
        </div>
      )}

      {batchPosts.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-zinc-500">Saved as drafts — schedule from Posts or Calendar</p>
          <div className="space-y-2">
            {batchPosts.map(post => (
              <div
                key={post.id}
                className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <Badge variant={post.channel as Channel}>{post.channel}</Badge>
                  <button
                    type="button"
                    onClick={() => handleCopy(post)}
                    className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white"
                  >
                    {copiedId === post.id ? (
                      <><Check className="w-3.5 h-3.5 text-green-400" />Copied</>
                    ) : (
                      <><Copy className="w-3.5 h-3.5" />Copy</>
                    )}
                  </button>
                </div>
                <p className="text-sm text-zinc-300 line-clamp-4 whitespace-pre-wrap">{post.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </form>
  )
}
