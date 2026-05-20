'use client'

import { useState, useRef } from 'react'
import {
  Sparkles, Loader2, Bold, Italic, List, ArrowUp, MessageSquare,
  Share2, Bookmark, MoreHorizontal, Check, CalendarClock, RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { parseRedditPost, type RedditPostContent } from '@/lib/reddit/parse'
import type { ContentGoal, GeneratedPost, PostLength } from '@/types/agents'

// ─── Constants ───────────────────────────────────────────────────────────────

const SUGGESTED_SUBREDDITS = [
  'entrepreneur', 'SaaS', 'startups', 'marketing', 'smallbusiness',
  'business', 'productivity', 'technology', 'webdev', 'programming',
]

const GOALS: { id: ContentGoal; label: string; description: string }[] = [
  { id: 'awareness', label: 'Awareness', description: 'Introduce the brand or project' },
  { id: 'engagement', label: 'Engagement', description: 'Start a conversation' },
  { id: 'promotion', label: 'Promotion', description: 'Drive interest toward a product' },
  { id: 'education', label: 'Education', description: 'Share genuine knowledge' },
]

const LENGTHS: { id: PostLength; label: string }[] = [
  { id: 'short', label: 'Short' },
  { id: 'medium', label: 'Medium' },
  { id: 'long', label: 'Long' },
]

// ─── Reddit preview mockup ────────────────────────────────────────────────────

function RedditPreview({ title, body, subreddit, disclosure, voteCount = 1 }: {
  title: string
  body: string
  subreddit: string
  disclosure?: string | null
  voteCount?: number
}) {
  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900 overflow-hidden text-left">
      {/* Post header */}
      <div className="px-4 pt-3 pb-1">
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 mb-2">
          <span className="font-semibold text-zinc-300">r/{subreddit || 'subreddit'}</span>
          <span>·</span>
          <span>Posted by u/you · just now</span>
        </div>
        <p className="text-sm font-semibold text-white leading-snug">
          {title || <span className="text-zinc-600 italic">Your title will appear here</span>}
        </p>
      </div>

      {/* Body */}
      {(body || disclosure) && (
        <div className="px-4 py-2 space-y-2">
          {body && (
            <p className="text-[12px] text-zinc-300 leading-relaxed whitespace-pre-wrap line-clamp-8">{body}</p>
          )}
          {disclosure && (
            <p className="text-[11px] text-zinc-500 italic">{disclosure}</p>
          )}
        </div>
      )}

      {/* Actions bar */}
      <div className="flex items-center gap-1 px-3 py-2 border-t border-zinc-800 mt-1">
        <div className="flex items-center gap-0.5 bg-zinc-800 rounded-full px-2 py-1">
          <button className="text-zinc-500 hover:text-orange-400 transition-colors">
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] font-semibold text-zinc-300 px-1">{voteCount}</span>
          <button className="text-zinc-500 hover:text-blue-400 transition-colors rotate-180">
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
        </div>
        <button className="flex items-center gap-1 px-2.5 py-1 rounded-full text-zinc-500 hover:bg-zinc-800 transition-colors">
          <MessageSquare className="w-3.5 h-3.5" />
          <span className="text-[11px]">Comment</span>
        </button>
        <button className="flex items-center gap-1 px-2.5 py-1 rounded-full text-zinc-500 hover:bg-zinc-800 transition-colors">
          <Share2 className="w-3.5 h-3.5" />
          <span className="text-[11px]">Share</span>
        </button>
        <button className="ml-auto p-1.5 rounded-full text-zinc-600 hover:bg-zinc-800 transition-colors">
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ─── Formatting ribbon ────────────────────────────────────────────────────────

function applyFormat(
  ref: React.RefObject<HTMLTextAreaElement | null>,
  value: string,
  setValue: (v: string) => void,
  type: 'bold' | 'italic' | 'bullet'
) {
  const ta = ref.current
  if (!ta) return
  const start = ta.selectionStart
  const end = ta.selectionEnd
  const before = value.slice(0, start)
  const selected = value.slice(start, end)
  const after = value.slice(end)
  let next = value
  let ns = start
  let ne = end

  if (type === 'bold') {
    next = `${before}**${selected}**${after}`; ns = start + 2; ne = end + 2
  } else if (type === 'italic') {
    next = `${before}_${selected}_${after}`; ns = start + 1; ne = end + 1
  } else {
    if (selected) {
      const bulleted = selected.split('\n').map(l => l.startsWith('• ') ? l : `• ${l}`).join('\n')
      next = `${before}${bulleted}${after}`; ne = start + bulleted.length
    } else {
      const ls = before.lastIndexOf('\n') + 1
      next = `${value.slice(0, ls)}• ${value.slice(ls)}`; ns = start + 2; ne = end + 2
    }
  }

  setValue(next)
  requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(ns, ne) })
}

function FormattingRibbon({ textareaRef, value, setValue }: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  value: string
  setValue: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-0.5 border border-zinc-800 rounded-lg p-1 w-fit">
      {([
        { type: 'bold' as const, icon: <Bold className="w-3.5 h-3.5" />, title: 'Bold' },
        { type: 'italic' as const, icon: <Italic className="w-3.5 h-3.5" />, title: 'Italic' },
        { type: 'bullet' as const, icon: <List className="w-3.5 h-3.5" />, title: 'Bullet' },
      ]).map(({ type, icon, title }) => (
        <button
          key={type}
          type="button"
          onMouseDown={e => { e.preventDefault(); applyFormat(textareaRef, value, setValue, type) }}
          title={title}
          className="p-1.5 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          {icon}
        </button>
      ))}
    </div>
  )
}

// ─── Main page client ─────────────────────────────────────────────────────────

type RedditPost = RedditPostContent & { subreddit: string }

type SaveState = 'idle' | 'saving' | 'draft' | 'scheduled'
type OutputTab = 'edit' | 'preview'

function resolveRedditFromResult(
  result: GeneratedPost,
  subredditFallback: string
): { post: RedditPost; imagePrompt?: string } | null {
  const variants = result.contentVariants as Record<string, unknown> | undefined
  const fromVariants = variants?.reddit as RedditPostContent | undefined

  if (fromVariants?.title && fromVariants?.body) {
    return {
      post: {
        title: fromVariants.title,
        body: fromVariants.body,
        subreddit: fromVariants.subreddit?.replace(/^r\//, '') || subredditFallback,
        disclosure: fromVariants.disclosure ?? null,
      },
      imagePrompt: result.imagePrompt ?? (variants?.imagePrompt as string | undefined),
    }
  }

  const parsed = parseRedditPost(result.content)
  if (parsed.post) {
    return {
      post: {
        ...parsed.post,
        subreddit: parsed.post.subreddit || subredditFallback,
        disclosure: parsed.post.disclosure ?? null,
      },
      imagePrompt: parsed.imagePrompt ?? result.imagePrompt,
    }
  }

  return null
}

interface RedditPageClientProps {
  companyId: string
  brandColors?: { primary?: string; accent?: string }
}

export function RedditPageClient({ companyId }: RedditPageClientProps) {
  // Form state
  const [topic, setTopic] = useState('')
  const [subredditHint, setSubredditHint] = useState('')
  const [contentGoal, setContentGoal] = useState<ContentGoal>('engagement')
  const [postLength, setPostLength] = useState<PostLength>('medium')
  const [additionalContext, setAdditionalContext] = useState('')
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState('')

  // Generated post state
  const [generatedPost, setGeneratedPost] = useState<RedditPost | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')
  const [editSubreddit, setEditSubreddit] = useState('')
  const [disclosure, setDisclosure] = useState<string | null>(null)
  const [imagePrompt, setImagePrompt] = useState<string | undefined>()
  const [outputTab, setOutputTab] = useState<OutputTab>('edit')

  // Approval state
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduledFor, setScheduledFor] = useState('')

  const bodyRef = useRef<HTMLTextAreaElement>(null)

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    if (!topic.trim()) return
    setLoading(true)
    setFormError('')
    setGeneratedPost(null)
    setSaveState('idle')
    setShowSchedule(false)

    const context = [
      additionalContext.trim(),
      subredditHint.trim() ? `Target subreddit: r/${subredditHint.trim()}` : '',
    ].filter(Boolean).join('\n')

    try {
      const res = await fetch('/api/generate/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          channel: 'reddit',
          topic: topic.trim(),
          contentGoal,
          postLength,
          additionalContext: context || undefined,
          stream: false,
        }),
      })

      if (!res.ok) {
        const d = await res.json()
        setFormError(d.error ?? 'Generation failed')
        return
      }

      const result = await res.json() as GeneratedPost
      const resolved = resolveRedditFromResult(result, subredditHint.trim())

      if (resolved) {
        const { post, imagePrompt: prompt } = resolved
        setEditTitle(post.title)
        setEditBody(post.body)
        setEditSubreddit(post.subreddit)
        setDisclosure(post.disclosure ?? null)
        setGeneratedPost(post)
        setImagePrompt(prompt)
        setOutputTab('preview')
      } else {
        setFormError('Could not parse the generated post — please try again')
      }
    } catch {
      setFormError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  async function savePost(status: 'draft' | 'scheduled', scheduledAt?: string) {
    setSaveState('saving')
    const content = `**${editTitle}**\n\n${editBody}${disclosure ? `\n\n*Disclosure: ${disclosure}*` : ''}`
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          channel: 'reddit',
          content,
          status,
          ...(scheduledAt ? { scheduled_for: scheduledAt } : {}),
          ai_generated: true,
          generation_params: { imagePrompt },
          content_variants: { reddit: { title: editTitle, body: editBody, subreddit: editSubreddit, disclosure } },
          media_items: [],
        }),
      })
      if (res.ok) {
        setSaveState(status === 'draft' ? 'draft' : 'scheduled')
        setShowSchedule(false)
        setScheduledFor('')
      } else {
        setSaveState('idle')
      }
    } catch {
      setSaveState('idle')
    }
  }

  function handleReset() {
    setGeneratedPost(null)
    setEditTitle(''); setEditBody(''); setEditSubreddit(''); setDisclosure(null)
    setSaveState('idle'); setShowSchedule(false); setScheduledFor('')
    setImagePrompt(undefined)
    setOutputTab('edit')
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-orange-500/15 flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-orange-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">Reddit</h1>
          </div>
          <p className="text-zinc-400 text-sm ml-11">
            Craft authentic Reddit posts that lead with value, not marketing speak
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* ── Left: form ── */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <form onSubmit={handleGenerate} className="space-y-6">
              {/* Topic */}
              <div className="space-y-1.5">
                <Label htmlFor="topic">What to write about</Label>
                <Textarea
                  id="topic"
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  placeholder="e.g. We just hit 1000 users — here's what we learned about onboarding"
                  rows={3}
                  required
                />
              </div>

              {/* Target subreddit */}
              <div className="space-y-2">
                <Label htmlFor="subreddit">
                  Target subreddit <span className="text-zinc-500 font-normal text-xs">(optional — AI will suggest one if left blank)</span>
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">r/</span>
                  <input
                    id="subreddit"
                    type="text"
                    value={subredditHint}
                    onChange={e => setSubredditHint(e.target.value.replace(/^r\//, ''))}
                    placeholder="entrepreneur"
                    className="w-full pl-7 pr-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTED_SUBREDDITS.map(sub => (
                    <button
                      key={sub}
                      type="button"
                      onClick={() => setSubredditHint(sub)}
                      className={cn(
                        'px-2 py-0.5 rounded text-xs transition-colors',
                        subredditHint === sub
                          ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                          : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300 border border-transparent'
                      )}
                    >
                      r/{sub}
                    </button>
                  ))}
                </div>
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
                          ? 'border-orange-500/50 bg-orange-500/10 text-orange-300'
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
                          ? 'border-orange-500/50 bg-orange-500/10 text-orange-300'
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
                  placeholder="Specific angle, data, or tone you want..."
                  rows={2}
                />
              </div>

              <Button
                type="submit"
                disabled={loading || !topic.trim()}
                className="w-full bg-orange-600 hover:bg-orange-500 focus-visible:ring-orange-500"
                size="lg"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Writing…</>
                ) : (
                  <><Sparkles className="w-4 h-4" />Generate Reddit post</>
                )}
              </Button>

              {formError && (
                <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-4 py-3">
                  {formError}
                </p>
              )}
            </form>
          </div>

          {/* ── Right: preview + editor ── */}
          <div className="sticky top-8 space-y-4">
            {!generatedPost ? (
              <div className="flex flex-col items-center justify-center h-80 text-center border border-dashed border-zinc-700 rounded-xl">
                <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center mb-3">
                  <MessageSquare className="w-6 h-6 text-orange-500/60" />
                </div>
                <p className="text-zinc-500 text-sm">Your Reddit post will appear here</p>
                <p className="text-zinc-600 text-xs mt-1">Fill out the form and click Generate</p>
              </div>
            ) : (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="flex border-b border-zinc-800">
                  {([
                    { id: 'edit' as const, label: 'Edit' },
                    { id: 'preview' as const, label: 'Preview' },
                  ]).map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setOutputTab(id)}
                      className={cn(
                        'flex-1 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                        outputTab === id
                          ? 'border-orange-500 text-white'
                          : 'border-transparent text-zinc-500 hover:text-zinc-300'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="p-4 space-y-3">
                  {outputTab === 'preview' ? (
                    <RedditPreview
                      title={editTitle}
                      body={editBody}
                      subreddit={editSubreddit}
                      disclosure={disclosure}
                    />
                  ) : (
                    <>
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-zinc-600 uppercase tracking-widest">Subreddit</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">r/</span>
                      <input
                        type="text"
                        value={editSubreddit}
                        onChange={e => setEditSubreddit(e.target.value.replace(/^r\//, ''))}
                        className="w-full pl-7 pr-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-orange-500/60"
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {SUGGESTED_SUBREDDITS.map(sub => (
                        <button
                          key={sub}
                          type="button"
                          onClick={() => setEditSubreddit(sub)}
                          className={cn(
                            'px-2 py-0.5 rounded text-xs transition-colors border',
                            editSubreddit === sub
                              ? 'bg-orange-500/20 text-orange-300 border-orange-500/30'
                              : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300 border-transparent'
                          )}
                        >
                          r/{sub}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Title editor */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-zinc-600 uppercase tracking-widest">Title</label>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      maxLength={300}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-orange-500/60"
                    />
                    <p className={cn('text-xs text-right', editTitle.length > 280 ? 'text-orange-400' : 'text-zinc-600')}>
                      {editTitle.length}/300
                    </p>
                  </div>

                  {/* Body editor */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-zinc-600 uppercase tracking-widest">Body</label>
                    <FormattingRibbon textareaRef={bodyRef} value={editBody} setValue={setEditBody} />
                    <textarea
                      ref={bodyRef}
                      value={editBody}
                      onChange={e => setEditBody(e.target.value)}
                      rows={10}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-200 leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-orange-500/60"
                    />
                  </div>

                  {/* Disclosure */}
                  {disclosure !== null && (
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-zinc-600 uppercase tracking-widest">Disclosure</label>
                      <input
                        type="text"
                        value={disclosure ?? ''}
                        onChange={e => setDisclosure(e.target.value || null)}
                        placeholder="I'm the founder at [company]"
                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-orange-500/60"
                      />
                      <button
                        type="button"
                        onClick={() => setDisclosure(null)}
                        className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
                      >
                        Remove disclosure
                      </button>
                    </div>
                  )}
                  {disclosure === null && (
                    <button
                      type="button"
                      onClick={() => setDisclosure('')}
                      className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
                    >
                      + Add disclosure
                    </button>
                  )}
                    </>
                  )}

                  {/* Image prompt hint */}
                  {imagePrompt && (
                    <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3">
                      <p className="text-xs text-zinc-500 font-medium mb-1 uppercase tracking-wide">Suggested image prompt</p>
                      <p className="text-xs text-zinc-400 leading-relaxed">{imagePrompt}</p>
                    </div>
                  )}

                  {/* Approval actions */}
                  {saveState === 'draft' ? (
                    <div className="flex items-center gap-3 pt-2 border-t border-zinc-800">
                      <span className="flex items-center gap-1.5 text-sm text-green-400">
                        <Check className="w-4 h-4" /> Saved as draft
                      </span>
                      <button
                        onClick={() => setSaveState('idle')}
                        className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
                      >
                        Edit again
                      </button>
                      <button
                        onClick={handleReset}
                        className="ml-auto flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
                      >
                        <RefreshCw className="w-3 h-3" />
                        New post
                      </button>
                    </div>
                  ) : saveState === 'scheduled' ? (
                    <div className="flex items-center gap-3 pt-2 border-t border-zinc-800">
                      <span className="flex items-center gap-1.5 text-sm text-yellow-400">
                        <CalendarClock className="w-4 h-4" /> Scheduled
                      </span>
                      <button
                        onClick={() => setSaveState('idle')}
                        className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
                      >
                        Edit again
                      </button>
                    </div>
                  ) : saveState === 'saving' ? (
                    <div className="flex items-center gap-2 text-sm text-zinc-500 pt-2 border-t border-zinc-800">
                      <Loader2 className="w-4 h-4 animate-spin" /> Saving…
                    </div>
                  ) : showSchedule ? (
                    <div className="space-y-2 pt-2 border-t border-zinc-800">
                      <p className="text-xs text-zinc-500">Pick a publish time</p>
                      <input
                        type="datetime-local"
                        value={scheduledFor}
                        onChange={e => setScheduledFor(e.target.value)}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-orange-500 [color-scheme:dark]"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => savePost('scheduled', new Date(scheduledFor).toISOString())}
                          disabled={!scheduledFor}
                          className="bg-orange-600 hover:bg-orange-500"
                        >
                          Confirm schedule
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setShowSchedule(false); setScheduledFor('') }}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 pt-2 border-t border-zinc-800">
                      <Button
                        size="sm"
                        onClick={() => savePost('draft')}
                        className="bg-orange-600 hover:bg-orange-500"
                      >
                        <Bookmark className="w-3.5 h-3.5" />
                        Approve as draft
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setShowSchedule(true)}>
                        <CalendarClock className="w-3.5 h-3.5" />
                        Schedule
                      </Button>
                      <button
                        onClick={handleReset}
                        className="ml-auto flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
                      >
                        <RefreshCw className="w-3 h-3" />
                        New post
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
