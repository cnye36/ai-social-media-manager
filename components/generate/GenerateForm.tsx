'use client'

import { useState } from 'react'
import { Sparkles, Copy, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import type { Channel, Post } from '@/types/database'

const CHANNELS: { id: Channel; label: string; hint: string }[] = [
  { id: 'linkedin', label: 'LinkedIn', hint: 'Thought leadership, 300–1300 chars' },
  { id: 'x', label: 'X', hint: '≤280 chars, punchy hook' },
  { id: 'reddit', label: 'Reddit', hint: 'Authentic, community-first' },
  { id: 'facebook', label: 'Facebook', hint: 'Friendly, story-driven' },
]

interface GenerateFormProps {
  companyId: string
}

export function GenerateForm({ companyId }: GenerateFormProps) {
  const [selectedChannels, setSelectedChannels] = useState<Channel[]>(['linkedin', 'x'])
  const [topic, setTopic] = useState('')
  const [loading, setLoading] = useState(false)
  const [posts, setPosts] = useState<Post[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)

  function toggleChannel(channel: Channel) {
    setSelectedChannels(prev =>
      prev.includes(channel)
        ? prev.filter(c => c !== channel)
        : [...prev, channel]
    )
  }

  async function handleGenerate() {
    if (!topic.trim() || selectedChannels.length === 0) return
    setLoading(true)
    setPosts([])
    setErrors([])

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, topic: topic.trim(), channels: selectedChannels }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrors([data.error ?? 'Generation failed'])
      } else {
        setPosts(data.posts ?? [])
        if (data.errors?.length) setErrors(data.errors)
      }
    } catch {
      setErrors(['Network error — please try again'])
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

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Channel toggles */}
      <div className="space-y-2">
        <Label>Channels</Label>
        <p className="text-xs text-zinc-500">Select which platforms to generate posts for</p>
        <div className="flex flex-wrap gap-2 mt-2">
          {CHANNELS.map(({ id, label, hint }) => {
            const active = selectedChannels.includes(id)
            return (
              <button
                key={id}
                onClick={() => toggleChannel(id)}
                title={hint}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
                  active
                    ? 'border-violet-500 bg-violet-600/15 text-violet-300'
                    : 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    active ? 'bg-violet-400' : 'bg-zinc-600'
                  }`}
                />
                {label}
              </button>
            )
          })}
        </div>
        {selectedChannels.length === 0 && (
          <p className="text-xs text-red-400">Select at least one channel</p>
        )}
      </div>

      {/* Topic input */}
      <div className="space-y-1.5">
        <Label htmlFor="topic">Topic or brief</Label>
        <Textarea
          id="topic"
          value={topic}
          onChange={e => setTopic(e.target.value)}
          placeholder="e.g. We just launched a new feature that lets users export reports as PDFs — share the news and highlight the time it saves"
          rows={4}
        />
        <p className="text-xs text-zinc-500">
          The more context you give, the better the output. Mention the goal, key points, or tone if needed.
        </p>
      </div>

      {/* Generate button */}
      <Button onClick={handleGenerate} disabled={!canGenerate || loading} size="lg">
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Generating {selectedChannels.length} post{selectedChannels.length !== 1 ? 's' : ''}…
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            Generate for {selectedChannels.length} channel{selectedChannels.length !== 1 ? 's' : ''}
          </>
        )}
      </Button>

      {/* Errors */}
      {errors.length > 0 && (
        <div className="rounded-lg border border-red-800 bg-red-900/20 p-4 space-y-1">
          {errors.map((e, i) => (
            <p key={i} className="text-sm text-red-300">{e}</p>
          ))}
        </div>
      )}

      {/* Results */}
      {posts.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Generated drafts</h2>
            <p className="text-xs text-zinc-500">Saved to your drafts automatically</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {posts.map(post => (
              <div
                key={post.id}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between">
                  <Badge variant={post.channel as Channel}>{post.channel}</Badge>
                  <button
                    onClick={() => handleCopy(post)}
                    className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
                  >
                    {copiedId === post.id ? (
                      <><Check className="w-3.5 h-3.5 text-green-400" /><span className="text-green-400">Copied</span></>
                    ) : (
                      <><Copy className="w-3.5 h-3.5" />Copy</>
                    )}
                  </button>
                </div>
                <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap flex-1">
                  {post.content}
                </p>
                <p className="text-xs text-zinc-600 text-right">
                  {post.content.length} chars
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
