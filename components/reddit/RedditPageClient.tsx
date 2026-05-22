'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Sparkles, Loader2, Bold, Italic, List, ArrowUp, MessageSquare,
  Share2, Bookmark, MoreHorizontal, Check, CalendarClock, RefreshCw,
  Eye, Pencil, X, Plus, Trash2, ToggleLeft, ToggleRight, ExternalLink,
  Copy, ChevronDown, ChevronUp, Radio,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { parseRedditPost, type RedditPostContent } from '@/lib/reddit/parse'
import type { ContentGoal, GeneratedPost, PostLength } from '@/types/agents'

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'generate' | 'opportunities' | 'monitors'

interface RedditOpportunity {
  id: string
  reddit_post_id: string
  subreddit: string
  title: string
  selftext: string
  url: string
  author: string
  score: number
  num_comments: number
  matched_keywords: string[]
  status: 'new' | 'drafted' | 'replied' | 'dismissed' | 'manual_review'
  draft_reply: string | null
  seen_at: string
}

interface RedditMonitor {
  id: string
  subreddits: string[]
  keywords: string[]
  is_active: boolean
  last_checked_at: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

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

const STATUS_FILTERS = [
  { id: undefined, label: 'All' },
  { id: 'new', label: 'New' },
  { id: 'drafted', label: 'Drafted' },
  { id: 'manual_review', label: 'Manual' },
  { id: 'dismissed', label: 'Dismissed' },
] as const

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

// ─── Opportunity card ─────────────────────────────────────────────────────────

function redditPostUrl(opp: RedditOpportunity): string {
  if (opp.url.startsWith('http')) return opp.url
  const id = opp.reddit_post_id.replace(/^t3_/, '')
  return `https://www.reddit.com/r/${opp.subreddit}/comments/${id}/`
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function OpportunityCard({
  opp,
  companyId,
  onUpdate,
}: {
  opp: RedditOpportunity
  companyId: string
  onUpdate: (updated: Partial<RedditOpportunity> & { id: string }) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [editingReply, setEditingReply] = useState(false)
  const [replyText, setReplyText] = useState(opp.draft_reply ?? '')
  const [copied, setCopied] = useState(false)

  const isDismissed = opp.status === 'dismissed'
  const postUrl = redditPostUrl(opp)

  async function handleDraft() {
    setDrafting(true)
    try {
      const res = await fetch(`/api/reddit/opportunities/${opp.id}/draft-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      })
      if (res.ok) {
        const { draft_reply } = await res.json() as { draft_reply: string }
        setReplyText(draft_reply)
        onUpdate({ id: opp.id, draft_reply, status: 'drafted' })
      }
    } finally {
      setDrafting(false)
    }
  }

  async function updateStatus(status: RedditOpportunity['status']) {
    const res = await fetch(`/api/reddit/opportunities/${opp.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) onUpdate({ id: opp.id, status })
  }

  async function saveReplyEdit() {
    const res = await fetch(`/api/reddit/opportunities/${opp.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft_reply: replyText }),
    })
    if (res.ok) {
      onUpdate({ id: opp.id, draft_reply: replyText })
      setEditingReply(false)
    }
  }

  function copyReply() {
    navigator.clipboard.writeText(replyText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const statusColors: Record<RedditOpportunity['status'], string> = {
    new: 'bg-blue-500/15 text-blue-300 border-blue-500/20',
    drafted: 'bg-violet-500/15 text-violet-300 border-violet-500/20',
    replied: 'bg-green-500/15 text-green-300 border-green-500/20',
    dismissed: 'bg-zinc-700/50 text-zinc-500 border-zinc-700',
    manual_review: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/20',
  }

  return (
    <div className={cn(
      'border rounded-xl overflow-hidden transition-all',
      isDismissed ? 'border-zinc-800 opacity-50' : 'border-zinc-700 bg-zinc-900'
    )}>
      {/* Card header */}
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className="text-xs font-semibold text-orange-400">r/{opp.subreddit}</span>
              <span className="text-[11px] text-zinc-600">u/{opp.author} · {timeAgo(opp.seen_at)}</span>
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium', statusColors[opp.status])}>
                {opp.status.replace('_', ' ')}
              </span>
            </div>
            <a
              href={postUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-white leading-snug line-clamp-2 hover:text-orange-300 transition-colors"
            >
              {opp.title}
            </a>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 text-[11px] text-zinc-500">
              <ArrowUp className="w-3 h-3" />
              <span>{opp.score}</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-zinc-500">
              <MessageSquare className="w-3 h-3" />
              <span>{opp.num_comments}</span>
            </div>
            <a
              href={postUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Open post on Reddit"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-zinc-400 hover:text-orange-300 hover:bg-zinc-800 border border-zinc-700/80 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Open</span>
            </a>
            <button
              onClick={() => setExpanded(e => !e)}
              className="p-1 rounded text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Matched keywords */}
        {opp.matched_keywords.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {opp.matched_keywords.map(kw => (
              <span key={kw} className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20">
                {kw}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Expanded post body + reply */}
      {expanded && (
        <div className="border-t border-zinc-800 px-4 py-3 space-y-4">
          {/* Post body */}
          {opp.selftext ? (
            <div className="bg-zinc-800/50 rounded-lg p-3">
              <p className="text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap line-clamp-6">{opp.selftext}</p>
            </div>
          ) : (
            <a
              href={postUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-orange-400 transition-colors"
            >
              View full post on Reddit <ExternalLink className="w-3 h-3" />
            </a>
          )}

          {/* Reply section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-zinc-600 uppercase tracking-widest">Reply draft</p>
              {opp.draft_reply && !editingReply && (
                <button
                  onClick={() => { setEditingReply(true); setReplyText(opp.draft_reply ?? '') }}
                  className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-white transition-colors"
                >
                  <Pencil className="w-3 h-3" /> Edit
                </button>
              )}
            </div>

            {!opp.draft_reply && !drafting && (
              <Button
                size="sm"
                onClick={handleDraft}
                className="bg-violet-600 hover:bg-violet-500 text-white w-full"
              >
                <Sparkles className="w-3.5 h-3.5" /> Draft reply with AI
              </Button>
            )}

            {drafting && (
              <div className="flex items-center gap-2 text-sm text-zinc-500 py-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Drafting…
              </div>
            )}

            {opp.draft_reply && (
              editingReply ? (
                <div className="space-y-2">
                  <textarea
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    rows={6}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-200 leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-violet-500"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveReplyEdit} className="bg-violet-600 hover:bg-violet-500">Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingReply(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="bg-zinc-800/60 border border-zinc-700 rounded-lg p-3">
                  <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">{opp.draft_reply}</p>
                </div>
              )
            )}
          </div>

          {/* Action bar */}
          {!isDismissed && (
            <div className="flex items-center gap-2 pt-1 flex-wrap">
              {opp.draft_reply && (
                <Button
                  size="sm"
                  onClick={copyReply}
                  className="bg-orange-600 hover:bg-orange-500"
                >
                  {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy reply</>}
                </Button>
              )}
              <a
                href={postUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors border border-zinc-700"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Open post
              </a>
              {opp.status !== 'manual_review' && (
                <button
                  onClick={() => updateStatus('manual_review')}
                  className="text-xs text-zinc-500 hover:text-yellow-400 transition-colors px-2"
                >
                  Mark manual
                </button>
              )}
              <button
                onClick={() => updateStatus('replied')}
                className="text-xs text-zinc-500 hover:text-green-400 transition-colors px-2"
              >
                Mark replied
              </button>
              <button
                onClick={() => updateStatus('dismissed')}
                className="ml-auto text-xs text-zinc-600 hover:text-red-400 transition-colors"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Opportunities tab ─────────────────────────────────────────────────────────

function OpportunitiesTab({ companyId }: { companyId: string }) {
  const [opportunities, setOpportunities] = useState<RedditOpportunity[]>([])
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)

  const fetchOpportunities = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ companyId })
      if (statusFilter) params.set('status', statusFilter)
      const res = await fetch(`/api/reddit/opportunities?${params}`)
      if (res.ok) setOpportunities(await res.json())
    } finally {
      setLoading(false)
    }
  }, [companyId, statusFilter])

  useEffect(() => { fetchOpportunities() }, [fetchOpportunities])

  function handleUpdate(updated: Partial<RedditOpportunity> & { id: string }) {
    setOpportunities(prev => prev.map(o => o.id === updated.id ? { ...o, ...updated } : o))
  }

  return (
    <div className="space-y-4">
      {/* Status filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {STATUS_FILTERS.map(f => (
          <button
            key={String(f.id)}
            onClick={() => setStatusFilter(f.id)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-all border',
              statusFilter === f.id
                ? 'bg-orange-500/15 text-orange-300 border-orange-500/30'
                : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300'
            )}
          >
            {f.label}
          </button>
        ))}
        <button
          onClick={fetchOpportunities}
          className="ml-auto p-1.5 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-zinc-500">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : opportunities.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-60 text-center border border-dashed border-zinc-700 rounded-xl">
          <Radio className="w-8 h-8 text-zinc-600 mb-3" />
          <p className="text-zinc-500 text-sm">No opportunities yet</p>
          <p className="text-zinc-600 text-xs mt-1">
            Add monitors in the Monitors tab — posts will appear here once the cron runs
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {opportunities.map(opp => (
            <OpportunityCard
              key={opp.id}
              opp={opp}
              companyId={companyId}
              onUpdate={handleUpdate}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Monitors tab ─────────────────────────────────────────────────────────────

function MonitorsTab({ companyId }: { companyId: string }) {
  const [monitors, setMonitors] = useState<RedditMonitor[]>([])
  const [loading, setLoading] = useState(true)
  const [subredditInput, setSubredditInput] = useState('')
  const [newSubreddits, setNewSubreddits] = useState<string[]>([])
  const [keywordInput, setKeywordInput] = useState('')
  const [newKeywordTags, setNewKeywordTags] = useState<string[]>([])
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')

  useEffect(() => {
    fetch(`/api/reddit/monitors?companyId=${companyId}`)
      .then(r => r.json())
      .then(data => { setMonitors(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [companyId])

  function addSubredditTag(raw: string) {
    const sub = raw.replace(/^r\//, '').trim().toLowerCase()
    if (!sub || newSubreddits.includes(sub)) return
    setNewSubreddits(prev => [...prev, sub])
    setSubredditInput('')
  }

  function removeSubredditTag(sub: string) {
    setNewSubreddits(prev => prev.filter(s => s !== sub))
  }

  function handleSubredditKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addSubredditTag(subredditInput)
    } else if (e.key === 'Backspace' && !subredditInput && newSubreddits.length > 0) {
      setNewSubreddits(prev => prev.slice(0, -1))
    }
  }

  function addKeywordTag(raw: string) {
    const kw = raw.trim()
    if (!kw || newKeywordTags.includes(kw)) return
    setNewKeywordTags(prev => [...prev, kw])
    setKeywordInput('')
  }

  function removeKeywordTag(kw: string) {
    setNewKeywordTags(prev => prev.filter(k => k !== kw))
  }

  function handleKeywordKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      addKeywordTag(keywordInput)
    } else if (e.key === 'Backspace' && !keywordInput && newKeywordTags.length > 0) {
      setNewKeywordTags(prev => prev.slice(0, -1))
    }
  }

  async function addMonitor(e: React.FormEvent) {
    e.preventDefault()
    // commit any text still in either input
    const pendingSub = subredditInput.replace(/^r\//, '').trim().toLowerCase()
    const subreddits = pendingSub
      ? [...new Set([...newSubreddits, pendingSub])]
      : newSubreddits
    if (!subreddits.length) return

    const pendingKw = keywordInput.trim()
    const keywords = pendingKw
      ? [...new Set([...newKeywordTags, pendingKw])]
      : newKeywordTags

    setAdding(true)
    setAddError('')

    const res = await fetch('/api/reddit/monitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_id: companyId, subreddits, keywords }),
    })

    if (res.ok) {
      const created = await res.json() as RedditMonitor
      setMonitors(prev => [...prev, created])
      setNewSubreddits([])
      setSubredditInput('')
      setNewKeywordTags([])
      setKeywordInput('')
    } else {
      const d = await res.json() as { error?: string }
      setAddError(d.error ?? 'Failed to add monitor')
    }
    setAdding(false)
  }

  async function toggleActive(monitor: RedditMonitor) {
    const res = await fetch(`/api/reddit/monitors/${monitor.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !monitor.is_active }),
    })
    if (res.ok) {
      setMonitors(prev => prev.map(m => m.id === monitor.id ? { ...m, is_active: !m.is_active } : m))
    }
  }

  async function deleteMonitor(id: string) {
    const res = await fetch(`/api/reddit/monitors/${id}`, { method: 'DELETE' })
    if (res.ok) setMonitors(prev => prev.filter(m => m.id !== id))
  }

  const canSubmit = newSubreddits.length > 0 || subredditInput.replace(/^r\//, '').trim().length > 0

  return (
    <div className="space-y-6">
      {/* Existing monitors */}
      {loading ? (
        <div className="flex items-center justify-center h-32 text-zinc-500">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : monitors.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-center border border-dashed border-zinc-700 rounded-xl">
          <Radio className="w-8 h-8 text-zinc-600 mb-3" />
          <p className="text-zinc-500 text-sm">No monitors yet</p>
          <p className="text-zinc-600 text-xs mt-1">Add your first monitor below</p>
        </div>
      ) : (
        <div className="space-y-2">
          {monitors.map(monitor => (
            <div
              key={monitor.id}
              className={cn(
                'flex items-start gap-3 p-4 rounded-xl border transition-all',
                monitor.is_active ? 'border-zinc-700 bg-zinc-900' : 'border-zinc-800 bg-zinc-900/50 opacity-60'
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center flex-wrap gap-1.5 mb-1.5">
                  {(monitor.subreddits ?? []).map(sub => (
                    <span key={sub} className="text-sm font-semibold text-orange-400">r/{sub}</span>
                  ))}
                  {monitor.last_checked_at && (
                    <span className="text-[10px] text-zinc-600">
                      · last checked {timeAgo(monitor.last_checked_at)}
                    </span>
                  )}
                </div>
                {monitor.keywords.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {monitor.keywords.map(kw => (
                      <span key={kw} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                        {kw}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-zinc-600">No keywords — all new posts will match</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => toggleActive(monitor)}
                  title={monitor.is_active ? 'Pause monitor' : 'Activate monitor'}
                  className="text-zinc-500 hover:text-orange-400 transition-colors"
                >
                  {monitor.is_active
                    ? <ToggleRight className="w-5 h-5 text-orange-400" />
                    : <ToggleLeft className="w-5 h-5" />}
                </button>
                <button
                  onClick={() => deleteMonitor(monitor.id)}
                  className="p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-zinc-800 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add monitor form */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4 text-orange-400" /> Add monitor
        </h3>
        <form onSubmit={addMonitor} className="space-y-4">
          <div className="space-y-1.5">
            <Label>
              Subreddits <span className="text-zinc-500 font-normal text-xs">(add multiple — press Enter or comma after each)</span>
            </Label>
            {/* Tag input */}
            <div
              className="flex flex-wrap gap-1.5 min-h-[40px] w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg focus-within:ring-1 focus-within:ring-orange-500 cursor-text"
              onClick={e => (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.focus()}
            >
              {newSubreddits.map(sub => (
                <span
                  key={sub}
                  className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded bg-orange-900/40 border border-orange-800/60 text-orange-300 text-xs font-medium"
                >
                  r/{sub}
                  <button
                    type="button"
                    onClick={() => removeSubredditTag(sub)}
                    className="text-orange-500 hover:text-orange-200 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={subredditInput}
                onChange={e => setSubredditInput(e.target.value.replace(/,/g, ''))}
                onKeyDown={handleSubredditKeyDown}
                onBlur={() => { if (subredditInput.trim()) addSubredditTag(subredditInput) }}
                placeholder={newSubreddits.length === 0 ? 'automation' : 'add another…'}
                className="flex-1 min-w-[120px] bg-transparent text-sm text-white placeholder-zinc-600 focus:outline-none py-0.5 px-1"
              />
            </div>
            {/* Suggested subreddit chips */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {SUGGESTED_SUBREDDITS.filter(s => !newSubreddits.includes(s)).map(sub => (
                <button
                  key={sub}
                  type="button"
                  onClick={() => addSubredditTag(sub)}
                  className="px-2 py-0.5 rounded text-xs bg-zinc-800 text-zinc-500 hover:text-zinc-300 border border-transparent transition-colors"
                >
                  r/{sub}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>
              Keywords{' '}
              <span className="text-zinc-500 font-normal text-xs">
                (press Enter after each · phrases work · leave blank to catch all posts)
              </span>
            </Label>
            <div
              className="flex flex-wrap gap-1.5 min-h-[40px] w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg focus-within:ring-1 focus-within:ring-orange-500 cursor-text"
              onClick={e => (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.focus()}
            >
              {newKeywordTags.map(kw => (
                <span
                  key={kw}
                  className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded bg-zinc-700 border border-zinc-600 text-zinc-300 text-xs font-medium"
                >
                  {kw}
                  <button
                    type="button"
                    onClick={() => removeKeywordTag(kw)}
                    className="text-zinc-500 hover:text-zinc-200 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={keywordInput}
                onChange={e => setKeywordInput(e.target.value)}
                onKeyDown={handleKeywordKeyDown}
                onBlur={() => { if (keywordInput.trim()) addKeywordTag(keywordInput) }}
                placeholder={newKeywordTags.length === 0 ? 'help with automation' : 'add another…'}
                className="flex-1 min-w-[160px] bg-transparent text-sm text-white placeholder-zinc-600 focus:outline-none py-0.5 px-1"
              />
            </div>
            <p className="text-[11px] text-zinc-600">
              Phrases match exactly — &ldquo;help with automation&rdquo; only fires on posts containing those words together.
            </p>
          </div>

          {addError && (
            <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">{addError}</p>
          )}

          <Button
            type="submit"
            disabled={adding || !canSubmit}
            className="bg-orange-600 hover:bg-orange-500"
          >
            {adding ? <><Loader2 className="w-4 h-4 animate-spin" /> Adding…</> : <><Plus className="w-4 h-4" /> Add monitor</>}
          </Button>
        </form>

        {/* Cron setup hint */}
        <div className="mt-5 pt-4 border-t border-zinc-800">
          <p className="text-[11px] text-zinc-600 font-medium mb-1.5 uppercase tracking-widest">Cron setup (GCP VM)</p>
          <code className="block bg-zinc-800 rounded-lg p-3 text-[11px] text-zinc-400 leading-relaxed break-all">
            {'*/5 * * * * curl -s -H "Authorization: Bearer $CRON_SECRET" \\\n  https://your-app.vercel.app/api/reddit/monitor'}
          </code>
          <p className="text-[11px] text-zinc-600 mt-2">Runs every 5 minutes. Uses the same CRON_SECRET env var.</p>
        </div>
      </div>
    </div>
  )
}

// ─── Generate tab (existing flow) ─────────────────────────────────────────────

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

function GenerateTab({ companyId }: { companyId: string }) {
  const [topic, setTopic] = useState('')
  const [subredditHint, setSubredditHint] = useState('')
  const [contentGoal, setContentGoal] = useState<ContentGoal>('engagement')
  const [postLength, setPostLength] = useState<PostLength>('medium')
  const [additionalContext, setAdditionalContext] = useState('')
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState('')

  const [generatedPost, setGeneratedPost] = useState<RedditPost | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')
  const [editSubreddit, setEditSubreddit] = useState('')
  const [disclosure, setDisclosure] = useState<string | null>(null)
  const [imagePrompt, setImagePrompt] = useState<string | undefined>()
  const [outputTab, setOutputTab] = useState<OutputTab>('edit')

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
        const d = await res.json() as { error?: string }
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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      {/* Left: form */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <form onSubmit={handleGenerate} className="space-y-6">
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

          <div className="space-y-2">
            <Label htmlFor="subreddit">
              Target subreddit <span className="text-zinc-500 font-normal text-xs">(optional)</span>
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
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" />Writing…</>
              : <><Sparkles className="w-4 h-4" />Generate Reddit post</>}
          </Button>

          {formError && (
            <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-4 py-3">
              {formError}
            </p>
          )}
        </form>
      </div>

      {/* Right: preview + editor */}
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

              {imagePrompt && (
                <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3">
                  <p className="text-xs text-zinc-500 font-medium mb-1 uppercase tracking-wide">Suggested image prompt</p>
                  <p className="text-xs text-zinc-400 leading-relaxed">{imagePrompt}</p>
                </div>
              )}

              {saveState === 'draft' ? (
                <div className="flex items-center gap-3 pt-2 border-t border-zinc-800">
                  <span className="flex items-center gap-1.5 text-sm text-green-400">
                    <Check className="w-4 h-4" /> Saved as draft
                  </span>
                  <button onClick={() => setSaveState('idle')} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
                    Edit again
                  </button>
                  <button onClick={handleReset} className="ml-auto flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
                    <RefreshCw className="w-3 h-3" /> New post
                  </button>
                </div>
              ) : saveState === 'scheduled' ? (
                <div className="flex items-center gap-3 pt-2 border-t border-zinc-800">
                  <span className="flex items-center gap-1.5 text-sm text-yellow-400">
                    <CalendarClock className="w-4 h-4" /> Scheduled
                  </span>
                  <button onClick={() => setSaveState('idle')} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
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
                  <Button size="sm" onClick={() => savePost('draft')} className="bg-orange-600 hover:bg-orange-500">
                    <Bookmark className="w-3.5 h-3.5" /> Approve as draft
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowSchedule(true)}>
                    <CalendarClock className="w-3.5 h-3.5" /> Schedule
                  </Button>
                  <button onClick={handleReset} className="ml-auto flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
                    <RefreshCw className="w-3 h-3" /> New post
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main page client ─────────────────────────────────────────────────────────

interface RedditPageClientProps {
  companyId: string
  brandColors?: { primary?: string; accent?: string }
}

export function RedditPageClient({ companyId }: RedditPageClientProps) {
  const [tab, setTab] = useState<Tab>('generate')

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'generate', label: 'Generate', icon: <Sparkles className="w-3.5 h-3.5" /> },
    { id: 'opportunities', label: 'Opportunities', icon: <Radio className="w-3.5 h-3.5" /> },
    { id: 'monitors', label: 'Monitors', icon: <Eye className="w-3.5 h-3.5" /> },
  ]

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-orange-500/15 flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-orange-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">Reddit</h1>
          </div>
          <p className="text-zinc-400 text-sm ml-11">
            Generate posts, monitor subreddits, and reply to opportunities
          </p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mb-6 bg-zinc-900 border border-zinc-800 rounded-xl p-1 w-fit">
          {tabs.map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                tab === id
                  ? 'bg-orange-600 text-white shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'generate' && <GenerateTab companyId={companyId} />}
        {tab === 'opportunities' && <OpportunitiesTab companyId={companyId} />}
        {tab === 'monitors' && <MonitorsTab companyId={companyId} />}
      </div>
    </div>
  )
}
