'use client'

import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { LinkedInIcon, XIcon, RedditIcon, FacebookIcon } from '@/components/ui/channel-icons'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { Channel } from '@/types/database'
import type { ContentGoal, PostLength } from '@/types/agents'

const CHANNELS: { id: Channel; label: string; icon: React.ReactNode; color: string }[] = [
  { id: 'linkedin', label: 'LinkedIn', icon: <LinkedInIcon className="w-4 h-4" />, color: 'text-blue-400 border-blue-500 bg-blue-500/10' },
  { id: 'x', label: 'X', icon: <XIcon className="w-4 h-4" />, color: 'text-zinc-200 border-zinc-400 bg-zinc-400/10' },
  { id: 'reddit', label: 'Reddit', icon: <RedditIcon className="w-4 h-4" />, color: 'text-orange-400 border-orange-500 bg-orange-500/10' },
  { id: 'facebook', label: 'Facebook', icon: <FacebookIcon className="w-4 h-4" />, color: 'text-blue-300 border-blue-400 bg-blue-400/10' },
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
}

export function GenerateForm({ companyId, onStream, onChunk, onDone, onError }: GenerateFormProps) {
  const [channel, setChannel] = useState<Channel>('linkedin')
  const [topic, setTopic] = useState('')
  const [contentGoal, setContentGoal] = useState<ContentGoal>('awareness')
  const [postLength, setPostLength] = useState<PostLength>('medium')
  const [additionalContext, setAdditionalContext] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    if (!topic.trim()) return

    setLoading(true)
    onStream(channel)

    try {
      const res = await fetch('/api/generate/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId, channel, topic: topic.trim(),
          contentGoal, postLength,
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

      // Extract image prompt from end of output
      const marker = '\n--\nIMAGE_PROMPT:'
      const idx = fullText.indexOf(marker)
      const imagePrompt = idx !== -1 ? fullText.slice(idx + marker.length).trim() : undefined
      onDone(imagePrompt)
    } catch {
      onError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleGenerate} className="space-y-6">
      {/* Channel selector */}
      <div className="space-y-2">
        <Label>Channel</Label>
        <div className="grid grid-cols-2 gap-2">
          {CHANNELS.map(({ id, label, icon, color }) => (
            <button
              key={id}
              type="button"
              onClick={() => setChannel(id)}
              className={cn(
                'flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm font-medium transition-all',
                channel === id
                  ? color
                  : 'border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-white'
              )}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Topic */}
      <div className="space-y-1.5">
        <Label htmlFor="topic">What to write about</Label>
        <Textarea
          id="topic"
          value={topic}
          onChange={e => setTopic(e.target.value)}
          placeholder="e.g. We just launched our new pricing plan that includes a free tier, or: Share our take on why most AI tools fail teams"
          rows={3}
          required
        />
      </div>

      {/* Goal */}
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

      <Button type="submit" disabled={loading || !topic.trim()} className="w-full" size="lg">
        <Sparkles className="w-4 h-4" />
        {loading ? 'Writing...' : 'Generate post'}
      </Button>
    </form>
  )
}
