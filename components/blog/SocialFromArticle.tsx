'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Loader2, Check, Send, ChevronDown, ChevronUp, X as XIcon, Wand2, CalendarClock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LinkedInIcon, XIcon as XLogoIcon, RedditIcon, FacebookIcon } from '@/components/ui/channel-icons'
import { SendToBufferButton } from '@/components/posts/SendToBufferButton'
import type { Channel, Post, ArticleStatus } from '@/types/database'
import type { PostScore } from '@/lib/content/score-post'

const CHANNELS: { id: Channel; label: string; icon: React.ReactNode }[] = [
  { id: 'linkedin', label: 'LinkedIn', icon: <LinkedInIcon className="w-3.5 h-3.5" /> },
  { id: 'x', label: 'X / Twitter', icon: <XLogoIcon className="w-3.5 h-3.5" /> },
  { id: 'facebook', label: 'Facebook', icon: <FacebookIcon className="w-3.5 h-3.5" /> },
  { id: 'reddit', label: 'Reddit', icon: <RedditIcon className="w-3.5 h-3.5" /> },
]

const AUTO_SCHEDULABLE: Channel[] = ['linkedin', 'x', 'facebook']

interface Card {
  post: Post
  score: PostScore | null
  scoring: boolean
  savingContent: boolean
  fixingIssue: string | null
  scheduling: boolean
  error: string
}

interface SocialFromArticleProps {
  articleId: string
  companyId: string
  defaultOpen?: boolean
  articleStatus: ArticleStatus
  articleScheduledFor: string | null
}

export function SocialFromArticle({
  articleId, companyId, defaultOpen = false, articleStatus, articleScheduledFor,
}: SocialFromArticleProps) {
  const [open, setOpen] = useState(defaultOpen)
  const [selectedChannels, setSelectedChannels] = useState<Channel[]>(['linkedin', 'x'])
  const [generating, setGenerating] = useState(false)
  const [cards, setCards] = useState<Card[]>([])
  const [generateError, setGenerateError] = useState('')

  function toggleChannel(ch: Channel) {
    setSelectedChannels(prev =>
      prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]
    )
  }

  function updateCard(idx: number, patch: Partial<Card>) {
    setCards(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c))
  }

  async function scoreCard(idx: number, post: Post) {
    updateCard(idx, { scoring: true })
    try {
      const res = await fetch('/api/posts/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: post.content, channel: post.channel }),
      })
      if (res.ok) {
        const score = await res.json() as PostScore
        updateCard(idx, { score, scoring: false })
      } else {
        updateCard(idx, { scoring: false })
      }
    } catch {
      updateCard(idx, { scoring: false })
    }
  }

  async function generate() {
    if (!selectedChannels.length) return
    setGenerating(true)
    setGenerateError('')
    try {
      const res = await fetch(`/api/articles/${articleId}/social`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels: selectedChannels }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to generate')

      const newPosts = data.posts as Post[]
      const startIdx = cards.length
      setCards(prev => [
        ...prev,
        ...newPosts.map(post => ({
          post, score: null, scoring: false, savingContent: false, fixingIssue: null, scheduling: false, error: '',
        })),
      ])
      newPosts.forEach((post, i) => { void scoreCard(startIdx + i, post) })
    } catch (e) {
      setGenerateError((e as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  function updateContent(idx: number, content: string) {
    setCards(prev => prev.map((c, i) => i === idx ? { ...c, post: { ...c.post, content } } : c))
  }

  async function saveContent(idx: number) {
    const card = cards[idx]
    updateCard(idx, { savingContent: true, error: '' })
    try {
      const res = await fetch(`/api/posts/${card.post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: card.post.content }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Save failed')
      }
      const updated = await res.json() as Post
      updateCard(idx, { post: updated, savingContent: false })
      void scoreCard(idx, updated)
    } catch (e) {
      updateCard(idx, { savingContent: false, error: (e as Error).message })
    }
  }

  async function fixIssue(idx: number, issue: string) {
    const card = cards[idx]
    updateCard(idx, { fixingIssue: issue, error: '' })
    try {
      const res = await fetch(`/api/posts/${card.post.id}/fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: card.post.content, instruction: issue }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Fix failed')
      }
      const { content } = await res.json() as { content: string }
      const saveRes = await fetch(`/api/posts/${card.post.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (!saveRes.ok) throw new Error('Save failed')
      const updated = await saveRes.json() as Post
      updateCard(idx, { post: updated, fixingIssue: null })
      void scoreCard(idx, updated)
    } catch (e) {
      updateCard(idx, { fixingIssue: null, error: (e as Error).message })
    }
  }

  async function scheduleCard(idx: number) {
    const card = cards[idx]
    updateCard(idx, { scheduling: true, error: '' })
    try {
      const res = await fetch(`/api/posts/${card.post.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ after: articleScheduledFor ?? undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Schedule failed')
      updateCard(idx, { post: data as Post, scheduling: false })
    } catch (e) {
      updateCard(idx, { scheduling: false, error: (e as Error).message })
    }
  }

  async function discardCard(idx: number) {
    const card = cards[idx]
    try {
      await fetch(`/api/posts/${card.post.id}`, { method: 'DELETE' })
    } finally {
      setCards(prev => prev.filter((_, i) => i !== idx))
    }
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-zinc-800/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Send className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-medium text-white">Promote on social media</span>
          <span className="text-xs text-zinc-500">Generate, score, schedule, and send to Buffer</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
      </button>

      {open && (
        <div className="border-t border-zinc-800 p-4 space-y-4">
          {/* Channel picker */}
          <div>
            <p className="text-xs text-zinc-500 mb-2">Select channels to generate posts for:</p>
            <div className="flex flex-wrap gap-2">
              {CHANNELS.map(({ id, label, icon }) => (
                <button
                  key={id}
                  onClick={() => toggleChannel(id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                    selectedChannels.includes(id)
                      ? 'bg-violet-600/20 border-violet-500/50 text-violet-300'
                      : 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:text-white'
                  )}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>
          </div>

          <Button
            size="sm"
            onClick={generate}
            disabled={generating || selectedChannels.length === 0}
            className="gap-1.5"
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {generating ? 'Generating…' : 'Generate promotional posts'}
          </Button>

          {(articleStatus === 'draft' || articleStatus === 'archived') && (
            <p className="text-xs text-zinc-600">
              This article isn&apos;t scheduled yet, so promo posts will use the next available slot starting now. Schedule the article above to time promo posts around its publish date.
            </p>
          )}

          {generateError && <p className="text-xs text-red-400">{generateError}</p>}

          {/* Post cards */}
          {cards.length > 0 && (
            <div className="space-y-3">
              {cards.map((card, i) => {
                const { post, score, scoring, savingContent, fixingIssue, scheduling, error } = card
                const canAutoSchedule = AUTO_SCHEDULABLE.includes(post.channel)
                return (
                  <div key={post.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant={post.channel}>{post.channel}</Badge>
                        {post.status === 'scheduled' && post.scheduled_for && (
                          <span className="flex items-center gap-1 text-xs text-yellow-400 font-medium">
                            <CalendarClock className="w-3.5 h-3.5" />
                            Scheduled
                          </span>
                        )}
                        {scoring ? (
                          <span className="text-xs text-zinc-500 flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" /> Scoring…
                          </span>
                        ) : score ? (
                          <span className={cn(
                            'text-xs font-medium',
                            score.pass ? 'text-green-400' : 'text-orange-400'
                          )}>
                            Score: {score.score}
                          </span>
                        ) : null}
                      </div>
                      <button
                        onClick={() => discardCard(i)}
                        className="text-zinc-600 hover:text-red-400 transition-colors"
                        title="Discard draft"
                      >
                        <XIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <textarea
                      value={post.content}
                      onChange={e => updateContent(i, e.target.value)}
                      onBlur={() => saveContent(i)}
                      rows={4}
                      className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-300 leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-violet-500/60"
                    />
                    {savingContent && <p className="text-xs text-zinc-500">Saving…</p>}

                    {score && score.issues.length > 0 && (
                      <div className="space-y-1.5">
                        {score.issues.map((issue, ii) => (
                          <div key={ii} className="flex items-start justify-between gap-2 rounded-lg bg-orange-950/20 border border-orange-900/30 px-2.5 py-1.5">
                            <p className="text-xs text-orange-300 leading-relaxed flex-1">{issue}</p>
                            <Button
                              size="sm"
                              variant="secondary"
                              className="gap-1 shrink-0 h-6 px-2 text-xs"
                              disabled={fixingIssue !== null}
                              onClick={() => fixIssue(i, issue)}
                            >
                              {fixingIssue === issue
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <Wand2 className="w-3 h-3" />}
                              Fix
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {error && <p className="text-xs text-red-400">{error}</p>}

                    <div className="flex items-center gap-2 pt-1">
                      {canAutoSchedule && post.status === 'draft' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => scheduleCard(i)}
                          disabled={scheduling}
                          className="gap-1.5"
                        >
                          {scheduling ? <Loader2 className="w-3 h-3 animate-spin" /> : <CalendarClock className="w-3 h-3" />}
                          {scheduling ? 'Scheduling…' : 'Schedule'}
                        </Button>
                      )}
                      {canAutoSchedule && post.status === 'scheduled' && (
                        <>
                          {post.scheduled_for && (
                            <span className="text-xs text-zinc-500">
                              {new Date(post.scheduled_for).toLocaleString(undefined, {
                                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                              })}
                            </span>
                          )}
                          <SendToBufferButton
                            postId={post.id}
                            channel={post.channel}
                            scheduledFor={post.scheduled_for}
                            bufferPostId={post.buffer_post_id}
                            onSuccess={updated => updateCard(i, { post: { ...post, ...updated } })}
                          />
                        </>
                      )}
                      {!canAutoSchedule && (
                        <p className="text-xs text-zinc-600">
                          Schedule this from the{' '}
                          <Link href={`/${companyId}/posts`} className="text-violet-400 hover:underline">
                            Posts page
                          </Link>
                          .
                        </p>
                      )}
                      {post.status === 'scheduled' && (
                        <span className="flex items-center gap-1 text-xs text-green-400 ml-auto">
                          <Check className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
