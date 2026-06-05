'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import {
  Sparkles, Loader2, Bold, Italic, List, ArrowUp, MessageSquare,
  Share2, Bookmark, MoreHorizontal, Check, CalendarClock, CircleCheck, RefreshCw,
  Eye, Pencil, X, Plus, Trash2, ToggleLeft, ToggleRight, ExternalLink,
  Copy, ChevronDown, ChevronUp, Radio, AlertTriangle, History,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { format, formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { buildStatusDatetimePayload, toDatetimeLocal } from '@/lib/content-status'
import { formatRedditMarkdown, parseRedditPost, type RedditPostContent } from '@/lib/reddit/parse'
import { lintRedditSubmission } from '@/lib/reddit/submission-lint'
import type { ContentGoal, GeneratedPost, PostLength } from '@/types/agents'
import type { Post } from '@/types/database'

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'generate' | 'ideas' | 'opportunities' | 'monitors' | 'saved' | 'history'

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
  posted_at: string
  seen_at: string
}

interface RedditMonitor {
  id: string
  subreddits: string[]
  keywords: string[]
  is_active: boolean
  last_checked_at: string | null
}

interface SubredditConfig {
  id: string
  company_id: string
  subreddit: string
  rules_text: string | null
  notes: string | null
  posting_guidance: string | null
  posting_guidance_updated_at: string | null
  updated_at: string
}

interface RedditIdea {
  title: string
  angle: string
  type: 'discussion' | 'story' | 'question' | 'resource' | 'ama'
  why_it_works: string
  compliance?: 'safe' | 'caution'
  compliance_note?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SUGGESTED_SUBREDDITS = [
  'automation', 'ArtificialIntelligence', 'AIAgents', 'ChatGPT',
  'startups', 'marketing', 'smallbusiness',
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
  { id: 'replied', label: 'Replied' },
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReplyVariant {
  approach: 'direct' | 'constraint' | 'experience' | 'contrarian'
  label: string
  text: string
}

// ─── Opportunity card ─────────────────────────────────────────────────────────

function redditPostUrl(opp: RedditOpportunity): string {
  if (opp.url.startsWith('http')) return opp.url
  const id = opp.reddit_post_id.replace(/^t3_/, '')
  return `https://www.reddit.com/r/${opp.subreddit}/comments/${id}/`
}

function timeAgo(iso: string): string {
  return formatDistanceToNow(new Date(iso), { addSuffix: true })
}

function formatPostedAt(iso: string): string {
  const d = new Date(iso)
  const relative = formatDistanceToNow(d, { addSuffix: true })
  const absolute = format(d, 'MMM d, yyyy · h:mm a')
  return `${relative} · ${absolute}`
}

const APPROACH_COLORS: Record<ReplyVariant['approach'], string> = {
  direct: 'border-blue-500/30 bg-blue-500/5',
  constraint: 'border-violet-500/30 bg-violet-500/5',
  experience: 'border-emerald-500/30 bg-emerald-500/5',
  contrarian: 'border-amber-500/30 bg-amber-500/5',
}

const APPROACH_LABEL_COLORS: Record<ReplyVariant['approach'], string> = {
  direct: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  constraint: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
  experience: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  contrarian: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
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
  const [variants, setVariants] = useState<ReplyVariant[]>([])
  const [selectedVariant, setSelectedVariant] = useState<ReplyVariant | null>(null)
  const [editingReply, setEditingReply] = useState(false)
  const [replyText, setReplyText] = useState(opp.draft_reply ?? '')
  const [draftContext, setDraftContext] = useState('')
  const [copied, setCopied] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [statusActionError, setStatusActionError] = useState<string | null>(null)
  const [statusUpdating, setStatusUpdating] = useState(false)

  const isDismissed = opp.status === 'dismissed'
  const isReplied = opp.status === 'replied'
  const postUrl = redditPostUrl(opp)

  // The active reply to display/copy: the edited text if editing, otherwise the saved draft
  const activeReply = editingReply ? replyText : (opp.draft_reply ?? '')

  async function handleDraft() {
    setDrafting(true)
    setDraftError(null)
    setVariants([])
    setSelectedVariant(null)
    try {
      const res = await fetch(`/api/reddit/opportunities/${opp.id}/draft-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          additionalContext: draftContext.trim() || undefined,
        }),
      })
      if (res.ok) {
        const { draft_replies } = await res.json() as { draft_replies: ReplyVariant[] }
        setVariants(draft_replies ?? [])
        setEditingReply(false)
      } else {
        const body = await res.json().catch(() => ({}))
        setDraftError(typeof body.error === 'string' ? body.error : 'Failed to draft reply')
      }
    } finally {
      setDrafting(false)
    }
  }

  async function selectVariant(variant: ReplyVariant) {
    setSelectedVariant(variant)
    setReplyText(variant.text)
    // Persist the selected variant as the draft
    const res = await fetch(`/api/reddit/opportunities/${opp.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft_reply: variant.text }),
    })
    if (res.ok) onUpdate({ id: opp.id, draft_reply: variant.text })
  }

  async function updateStatus(status: RedditOpportunity['status']) {
    setStatusUpdating(true)
    setStatusActionError(null)
    try {
      const res = await fetch(`/api/reddit/opportunities/${opp.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (res.ok) {
        const data = await res.json() as RedditOpportunity
        onUpdate({
          id: data.id,
          status: data.status,
          draft_reply: data.draft_reply,
        })
        if (status === 'replied') {
          setVariants([])
          setSelectedVariant(null)
        }
      } else {
        const body = await res.json().catch(() => ({}))
        setStatusActionError(
          typeof body.error === 'string' ? body.error : 'Could not update status',
        )
      }
    } finally {
      setStatusUpdating(false)
    }
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
    navigator.clipboard.writeText(activeReply)
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
              <span className="text-[11px] text-zinc-600" title="When this was posted on Reddit">
                u/{opp.author} · Posted {formatPostedAt(opp.posted_at)}
              </span>
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
          <div className="space-y-3">
            <p className="text-[10px] text-zinc-600 uppercase tracking-widest">Reply</p>

            {/* Instructions input */}
            <div className="space-y-1.5">
              <Label className="text-[11px] text-zinc-500 font-normal">
                Instructions for the AI{' '}
                <span className="text-zinc-600">(optional — angle, what to mention or avoid)</span>
              </Label>
              <Textarea
                value={draftContext}
                onChange={e => setDraftContext(e.target.value)}
                rows={2}
                disabled={drafting}
                placeholder="e.g. Share a practical tip only. Reference experience with async workflows. Keep it under 4 sentences."
                className="bg-zinc-800 border-zinc-700 text-sm resize-none"
              />
            </div>

            {draftError && (
              <p className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
                {draftError}
              </p>
            )}

            <Button
              size="sm"
              onClick={handleDraft}
              disabled={drafting}
              className="bg-violet-600 hover:bg-violet-500 text-white w-full"
            >
              {drafting
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating 4 reply options…</>
                : <><Sparkles className="w-3.5 h-3.5" /> {variants.length > 0 || opp.draft_reply ? 'Regenerate replies' : 'Generate reply options'}</>
              }
            </Button>

            {/* Variant cards — shown after AI generates options */}
            {variants.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] text-zinc-500">
                  Pick the approach that fits best — click to select:
                </p>
                {variants.map(variant => {
                  const isSelected = selectedVariant?.approach === variant.approach
                  return (
                    <div
                      key={variant.approach}
                      className={cn(
                        'rounded-lg border p-3 transition-all cursor-pointer',
                        isSelected
                          ? APPROACH_COLORS[variant.approach]
                          : 'border-zinc-700 bg-zinc-800/40 hover:border-zinc-600'
                      )}
                      onClick={() => selectVariant(variant)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded border font-medium',
                          APPROACH_LABEL_COLORS[variant.approach]
                        )}>
                          {variant.label}
                        </span>
                        {isSelected && (
                          <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                            <Check className="w-3 h-3" /> Selected
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">{variant.text}</p>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Saved draft (when no variants showing or after selection) */}
            {opp.draft_reply && variants.length === 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-zinc-600 uppercase tracking-widest">Selected reply</p>
                  {!editingReply && (
                    <button
                      onClick={() => { setEditingReply(true); setReplyText(opp.draft_reply ?? '') }}
                      className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-white transition-colors"
                    >
                      <Pencil className="w-3 h-3" /> Edit
                    </button>
                  )}
                </div>
                {editingReply ? (
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
                )}
              </div>
            )}

            {/* After selecting a variant, allow editing it */}
            {selectedVariant && variants.length > 0 && (
              <div className="space-y-2 pt-1 border-t border-zinc-800">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-zinc-500">Edit before posting</p>
                  <button
                    onClick={() => { setEditingReply(true); setReplyText(selectedVariant.text) }}
                    className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-white transition-colors"
                  >
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Action bar */}
          {!isDismissed && (
            <div className="space-y-2 pt-1">
              {statusActionError && (
                <p className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
                  {statusActionError}
                </p>
              )}
              {isReplied && (
                <p className="text-xs text-green-400/90">
                  Marked as replied — switch to the Replied filter to find it again.
                </p>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                {(opp.draft_reply || selectedVariant) && (
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
                {opp.status !== 'manual_review' && !isReplied && (
                  <button
                    type="button"
                    disabled={statusUpdating}
                    onClick={() => updateStatus('manual_review')}
                    className="text-xs text-zinc-500 hover:text-yellow-400 transition-colors px-2 disabled:opacity-50"
                  >
                    Mark manual
                  </button>
                )}
                {!isReplied && (
                  <button
                    type="button"
                    disabled={statusUpdating}
                    onClick={() => updateStatus('replied')}
                    className="text-xs text-zinc-500 hover:text-green-400 transition-colors px-2 disabled:opacity-50"
                  >
                    {statusUpdating ? 'Saving…' : 'Mark replied'}
                  </button>
                )}
                <button
                  type="button"
                  disabled={statusUpdating}
                  onClick={() => updateStatus('dismissed')}
                  className="ml-auto text-xs text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-50"
                >
                  Dismiss
                </button>
              </div>
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
    setOpportunities(prev => {
      if (statusFilter && updated.status && updated.status !== statusFilter) {
        return prev.filter(o => o.id !== updated.id)
      }
      return prev.map(o => (o.id === updated.id ? { ...o, ...updated } : o))
    })
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
type SaveState = 'idle' | 'saving' | 'draft' | 'scheduled' | 'published'
type OutputTab = 'edit' | 'preview'

function redditFromPost(post: Post): RedditPost | null {
  const variants = post.content_variants?.reddit as RedditPostContent | undefined
  if (variants?.title && variants?.body) {
    return {
      title: variants.title,
      body: variants.body,
      subreddit: variants.subreddit?.replace(/^r\//, '') ?? '',
      disclosure: variants.disclosure ?? null,
    }
  }
  const parsed = parseRedditPost(post.content)
  if (!parsed.post) return null
  return {
    ...parsed.post,
    subreddit: parsed.post.subreddit?.replace(/^r\//, '') ?? '',
    disclosure: parsed.post.disclosure ?? null,
  }
}

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

function GenerateTab({
  companyId,
  initialTopic = '',
  initialSubreddit = '',
  initialDraft = null,
  onDraftSaved,
}: {
  companyId: string
  initialTopic?: string
  initialSubreddit?: string
  initialDraft?: Post | null
  onDraftSaved?: () => void
}) {
  const [topic, setTopic] = useState(initialTopic)
  const [subredditHint, setSubredditHint] = useState(initialSubreddit)
  const [contentGoal, setContentGoal] = useState<ContentGoal>('engagement')
  const [postLength, setPostLength] = useState<PostLength>('medium')
  const [additionalContext, setAdditionalContext] = useState('')
  const [includeDisclosure, setIncludeDisclosure] = useState(false)
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
  const [showMarkPublished, setShowMarkPublished] = useState(false)
  const [scheduledFor, setScheduledFor] = useState('')
  const [publishedFor, setPublishedFor] = useState('')
  const [savedPostId, setSavedPostId] = useState<string | null>(initialDraft?.id ?? null)

  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const submissionLint = useMemo(
    () => lintRedditSubmission(editBody, editSubreddit || subredditHint),
    [editBody, editSubreddit, subredditHint]
  )

  useEffect(() => {
    if (!initialDraft) return
    const reddit = redditFromPost(initialDraft)
    if (!reddit) return
    setSavedPostId(initialDraft.id)
    setEditTitle(reddit.title)
    setEditBody(reddit.body)
    setEditSubreddit(reddit.subreddit)
    setDisclosure(reddit.disclosure ?? null)
    setGeneratedPost(reddit)
    setTopic(initialTopic || reddit.title)
    setSubredditHint(initialSubreddit || reddit.subreddit)
    setImagePrompt(
      (initialDraft.generation_params?.imagePrompt as string | undefined) ?? undefined
    )
    setSaveState('idle')
    setShowSchedule(false)
    setShowMarkPublished(false)
    setOutputTab('edit')
  }, [initialDraft, initialTopic, initialSubreddit])

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    if (!topic.trim()) return
    setLoading(true)
    setFormError('')
    setGeneratedPost(null)
    setSaveState('idle')
    setShowSchedule(false)
    setShowMarkPublished(false)

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
          includeDisclosure,
          subreddit: (editSubreddit || subredditHint).trim().replace(/^r\//, '') || undefined,
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
        setDisclosure(
          includeDisclosure ? (post.disclosure?.trim() || '') : null
        )
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

  async function savePost(status: 'draft' | 'scheduled' | 'published', datetime?: string) {
    if (!editTitle.trim() || !editBody.trim()) return
    setSaveState('saving')
    const content = formatRedditMarkdown({
      title: editTitle.trim(),
      body: editBody.trim(),
      subreddit: editSubreddit,
      disclosure,
    })
    const statusPayload = status === 'draft'
      ? { status: 'draft' as const, scheduled_for: null }
      : buildStatusDatetimePayload(status, datetime ?? '')
    const payload = {
      content,
      ...statusPayload,
      generation_params: { imagePrompt },
      content_variants: {
        reddit: {
          title: editTitle.trim(),
          body: editBody.trim(),
          subreddit: editSubreddit,
          disclosure,
        },
      },
      media_items: [] as [],
    }
    try {
      const res = savedPostId
        ? await fetch(`/api/posts/${savedPostId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              company_id: companyId,
              channel: 'reddit',
              ...payload,
            }),
          })
      if (res.ok) {
        const saved = await res.json() as Post
        setSavedPostId(saved.id)
        setSaveState(
          status === 'draft' ? 'draft' : status === 'scheduled' ? 'scheduled' : 'published'
        )
        setShowSchedule(false)
        setShowMarkPublished(false)
        setScheduledFor('')
        setPublishedFor('')
        if (status === 'draft') onDraftSaved?.()
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
    setSaveState('idle'); setShowSchedule(false); setShowMarkPublished(false)
    setScheduledFor(''); setPublishedFor('')
    setImagePrompt(undefined)
    setSavedPostId(null)
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

          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={includeDisclosure}
              onChange={e => setIncludeDisclosure(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-orange-600 focus:ring-orange-500/60 focus:ring-offset-zinc-900"
            />
            <span className="text-sm leading-snug">
              <span className="text-zinc-200 group-hover:text-white transition-colors">
                Include affiliation disclosure
              </span>
              <span className="block text-xs text-zinc-500 mt-0.5">
                Adds a short line like &quot;I&apos;m the founder at [company]&quot; — off by default
              </span>
            </span>
          </label>

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
                      className={cn(
                        'w-full bg-zinc-800 border rounded-lg px-3 py-2.5 text-sm text-zinc-200 leading-relaxed resize-none focus:outline-none focus:ring-1',
                        submissionLint.some(i => i.severity === 'block')
                          ? 'border-red-500/60 focus:ring-red-500/50'
                          : 'border-zinc-700 focus:ring-orange-500/60'
                      )}
                    />
                    {submissionLint.length > 0 && (
                      <div className="space-y-2">
                        {submissionLint.map(issue => (
                          <div
                            key={issue.id}
                            className={cn(
                              'rounded-lg px-3 py-2.5 text-xs leading-relaxed border',
                              issue.severity === 'block'
                                ? 'bg-red-950/40 border-red-800/60 text-red-200'
                                : 'bg-amber-950/30 border-amber-800/50 text-amber-200'
                            )}
                          >
                            <p className="flex items-start gap-1.5 font-medium">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              {issue.message}
                            </p>
                            {issue.excerpt && (
                              <p className="mt-1.5 text-[11px] opacity-80 font-mono">{issue.excerpt}</p>
                            )}
                            <p className="mt-1.5 text-[11px] opacity-90">{issue.suggestion}</p>
                          </div>
                        ))}
                        {(editSubreddit || subredditHint).replace(/^r\//, '').toLowerCase() === 'automation' && (
                          <p className="text-[11px] text-zinc-500">
                            r/automation often rejects procedural how-to language (field order, if/then create rules) even in genuine discussion posts.
                          </p>
                        )}
                      </div>
                    )}
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
                    <Check className="w-4 h-4" /> Saved for later
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
              ) : saveState === 'published' ? (
                <div className="flex items-center gap-3 pt-2 border-t border-zinc-800">
                  <span className="flex items-center gap-1.5 text-sm text-emerald-400">
                    <CircleCheck className="w-4 h-4" /> Marked as published
                  </span>
                  <button onClick={() => setSaveState('idle')} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
                    Edit again
                  </button>
                  <button onClick={handleReset} className="ml-auto flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
                    <RefreshCw className="w-3 h-3" /> New post
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
              ) : showMarkPublished ? (
                <div className="space-y-2 pt-2 border-t border-zinc-800">
                  <p className="text-xs text-zinc-500">When did you publish on Reddit?</p>
                  <input
                    type="datetime-local"
                    value={publishedFor}
                    onChange={e => setPublishedFor(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-orange-500 [color-scheme:dark]"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => savePost('published', publishedFor)}
                      className="bg-emerald-600 hover:bg-emerald-500"
                    >
                      <CircleCheck className="w-3.5 h-3.5" />
                      Confirm published
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setShowMarkPublished(false); setPublishedFor('') }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-800">
                  <Button size="sm" onClick={() => savePost('draft')} className="bg-orange-600 hover:bg-orange-500">
                    <Bookmark className="w-3.5 h-3.5" /> {savedPostId ? 'Update saved post' : 'Save for later'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setShowMarkPublished(false); setShowSchedule(true) }}>
                    <CalendarClock className="w-3.5 h-3.5" /> Schedule
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setShowSchedule(false)
                      setPublishedFor(toDatetimeLocal(new Date().toISOString()))
                      setShowMarkPublished(true)
                    }}
                  >
                    <CircleCheck className="w-3.5 h-3.5" />
                    Mark published
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

// ─── Ideas tab ────────────────────────────────────────────────────────────────

const IDEA_TYPE_LABELS: Record<RedditIdea['type'], string> = {
  discussion: 'Discussion',
  story: 'Story',
  question: 'Question',
  resource: 'Resource',
  ama: 'AMA',
}

const IDEA_TYPE_COLORS: Record<RedditIdea['type'], string> = {
  discussion: 'bg-blue-500/15 text-blue-300 border-blue-500/20',
  story: 'bg-violet-500/15 text-violet-300 border-violet-500/20',
  question: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/20',
  resource: 'bg-green-500/15 text-green-300 border-green-500/20',
  ama: 'bg-orange-500/15 text-orange-300 border-orange-500/20',
}

function IdeasTab({
  companyId,
  onUseIdea,
}: {
  companyId: string
  onUseIdea: (topic: string, subreddit: string) => void
}) {
  // ── Subreddit configs state ──
  const [configs, setConfigs] = useState<SubredditConfig[]>([])
  const [configsLoading, setConfigsLoading] = useState(true)
  const [newSub, setNewSub] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [expandedConfig, setExpandedConfig] = useState<string | null>(null)
  const [editingRules, setEditingRules] = useState<string | null>(null)
  const [editRulesText, setEditRulesText] = useState('')
  const [savingRules, setSavingRules] = useState(false)
  const [editingGuidance, setEditingGuidance] = useState<string | null>(null)
  const [editGuidanceText, setEditGuidanceText] = useState('')
  const [savingGuidance, setSavingGuidance] = useState(false)
  const [refreshingGuidance, setRefreshingGuidance] = useState<string | null>(null)

  // ── Ideas state ──
  const [selectedSub, setSelectedSub] = useState('')
  const [topicHint, setTopicHint] = useState('')
  const [ideas, setIdeas] = useState<RedditIdea[]>([])
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')

  useEffect(() => {
    fetch(`/api/reddit/subreddit-configs?companyId=${companyId}`)
      .then(r => r.json())
      .then((data: SubredditConfig[]) => {
        setConfigs(data)
        if (data.length > 0 && !selectedSub) setSelectedSub(data[0].subreddit)
      })
      .catch(() => null)
      .finally(() => setConfigsLoading(false))
  }, [companyId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function addConfig(e: React.FormEvent) {
    e.preventDefault()
    if (!newSub.trim()) return
    setAdding(true)
    setAddError('')
    const res = await fetch('/api/reddit/subreddit-configs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_id: companyId, subreddit: newSub.trim(), notes: newNotes.trim() || undefined }),
    })
    if (res.ok) {
      const created = await res.json() as SubredditConfig
      setConfigs(prev => [...prev, created])
      if (!selectedSub) setSelectedSub(created.subreddit)
      setNewSub('')
      setNewNotes('')
    } else {
      const d = await res.json() as { error?: string }
      setAddError(d.error ?? 'Failed to add subreddit')
    }
    setAdding(false)
  }

  async function deleteConfig(id: string) {
    const res = await fetch(`/api/reddit/subreddit-configs/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setConfigs(prev => {
        const next = prev.filter(c => c.id !== id)
        if (selectedSub === prev.find(c => c.id === id)?.subreddit) {
          setSelectedSub(next[0]?.subreddit ?? '')
        }
        return next
      })
    }
  }

  async function saveRules(id: string) {
    setSavingRules(true)
    const res = await fetch(`/api/reddit/subreddit-configs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rules_text: editRulesText }),
    })
    if (res.ok) {
      const updated = await res.json() as SubredditConfig
      setConfigs(prev => prev.map(c => c.id === id ? updated : c))
      setEditingRules(null)
    }
    setSavingRules(false)
  }

  async function saveGuidance(id: string) {
    setSavingGuidance(true)
    const res = await fetch(`/api/reddit/subreddit-configs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ posting_guidance: editGuidanceText }),
    })
    if (res.ok) {
      const updated = await res.json() as SubredditConfig
      setConfigs(prev => prev.map(c => c.id === id ? updated : c))
      setEditingGuidance(null)
    }
    setSavingGuidance(false)
  }

  async function refreshGuidance(id: string) {
    setRefreshingGuidance(id)
    const res = await fetch(`/api/reddit/subreddit-configs/${id}/refresh-guidance`, { method: 'POST' })
    if (res.ok) {
      const updated = await res.json() as SubredditConfig
      setConfigs(prev => prev.map(c => c.id === id ? updated : c))
    }
    setRefreshingGuidance(null)
  }

  const selectedConfig = configs.find(c => c.subreddit === selectedSub)

  async function generateIdeas(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedSub) return
    setGenerating(true)
    setGenError('')
    setIdeas([])
    const res = await fetch('/api/reddit/ideas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, subreddit: selectedSub, topicHint: topicHint.trim() || undefined }),
    })
    if (res.ok) {
      const data = await res.json() as RedditIdea[]
      setIdeas(data)
    } else {
      setGenError('Failed to generate ideas — please try again')
    }
    setGenerating(false)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

      {/* Left: subreddit configs */}
      <div className="space-y-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800">
            <h2 className="text-sm font-semibold text-white">Your target subreddits</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Rules and posting guidance are auto-generated per sub. Ideas and posts follow both.
            </p>
          </div>

          {configsLoading ? (
            <div className="flex items-center justify-center h-24 text-zinc-500">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : configs.length === 0 ? (
            <div className="px-5 py-8 text-center text-zinc-500 text-sm">
              No subreddits configured yet. Add one below.
            </div>
          ) : (
            <div className="divide-y divide-zinc-800">
              {configs.map(cfg => (
                <div key={cfg.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => setExpandedConfig(expandedConfig === cfg.id ? null : cfg.id)}
                      className="flex items-center gap-2 text-left flex-1 min-w-0"
                    >
                      <span className="text-sm font-semibold text-orange-400">r/{cfg.subreddit}</span>
                      {cfg.rules_text
                        ? <span className="text-[10px] text-green-500 bg-green-500/10 border border-green-500/20 rounded px-1.5 py-0.5">Rules</span>
                        : <span className="text-[10px] text-zinc-600 bg-zinc-800 rounded px-1.5 py-0.5">No rules</span>
                      }
                      {cfg.posting_guidance
                        ? <span className="text-[10px] text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded px-1.5 py-0.5">Guidance</span>
                        : <span className="text-[10px] text-amber-500/80 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5">No guidance</span>
                      }
                      {expandedConfig === cfg.id
                        ? <ChevronUp className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                        : <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                      }
                    </button>
                    <button
                      onClick={() => deleteConfig(cfg.id)}
                      className="p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-zinc-800 transition-colors shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {expandedConfig === cfg.id && (
                    <div className="mt-3 space-y-3">
                      {editingRules === cfg.id ? (
                        <div className="space-y-2">
                          <label className="text-[10px] text-zinc-600 uppercase tracking-widest">Rules</label>
                          <textarea
                            value={editRulesText}
                            onChange={e => setEditRulesText(e.target.value)}
                            rows={8}
                            placeholder="Paste or type the subreddit rules here..."
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-300 leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-orange-500"
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => saveRules(cfg.id)}
                              disabled={savingRules}
                              className="bg-orange-600 hover:bg-orange-500 text-xs"
                            >
                              {savingRules ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingRules(null)} className="text-xs">
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] text-zinc-600 uppercase tracking-widest">Rules</label>
                            <button
                              onClick={() => { setEditingRules(cfg.id); setEditRulesText(cfg.rules_text ?? '') }}
                              className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-white transition-colors"
                            >
                              <Pencil className="w-3 h-3" /> Edit
                            </button>
                          </div>
                          {cfg.rules_text ? (
                            <p className="text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap line-clamp-6 bg-zinc-800/50 rounded-lg p-2.5">
                              {cfg.rules_text}
                            </p>
                          ) : (
                            <p className="text-xs text-zinc-600 italic">No rules saved. Click Edit to add them manually.</p>
                          )}
                        </div>
                      )}

                      <div className="space-y-1.5 pt-2 border-t border-zinc-800">
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-[10px] text-zinc-600 uppercase tracking-widest">Posting guidance</label>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => refreshGuidance(cfg.id)}
                              disabled={refreshingGuidance === cfg.id}
                              className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-orange-300 transition-colors disabled:opacity-50"
                            >
                              {refreshingGuidance === cfg.id
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <RefreshCw className="w-3 h-3" />}
                              Regenerate
                            </button>
                            {editingGuidance !== cfg.id && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingGuidance(cfg.id)
                                  setEditGuidanceText(cfg.posting_guidance ?? '')
                                }}
                                className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-white transition-colors"
                              >
                                <Pencil className="w-3 h-3" /> Edit
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-[11px] text-zinc-600">What works, what to avoid, and ban risks for r/{cfg.subreddit}</p>
                        {editingGuidance === cfg.id ? (
                          <div className="space-y-2">
                            <textarea
                              value={editGuidanceText}
                              onChange={e => setEditGuidanceText(e.target.value)}
                              rows={10}
                              placeholder={'## What performs well\n...'}
                              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-300 leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-orange-500"
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => saveGuidance(cfg.id)}
                                disabled={savingGuidance}
                                className="bg-orange-600 hover:bg-orange-500 text-xs"
                              >
                                {savingGuidance ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingGuidance(null)} className="text-xs">
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : cfg.posting_guidance ? (
                          <p className="text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap line-clamp-8 bg-violet-500/5 border border-violet-500/10 rounded-lg p-2.5">
                            {cfg.posting_guidance}
                          </p>
                        ) : (
                          <p className="text-xs text-amber-500/80 italic">
                            No guidance yet. Click Regenerate to analyze rules and hot posts (recommended before generating ideas).
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add form */}
          <div className="px-5 py-4 border-t border-zinc-800 bg-zinc-900/50">
            <form onSubmit={addConfig} className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[10px] text-zinc-600 uppercase tracking-widest">Add subreddit</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">r/</span>
                  <input
                    type="text"
                    value={newSub}
                    onChange={e => setNewSub(e.target.value.replace(/^r\//, ''))}
                    placeholder="entrepreneur"
                    className="w-full pl-7 pr-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
                <div className="flex flex-wrap gap-1">
                  {SUGGESTED_SUBREDDITS.map(sub => (
                    <button
                      key={sub}
                      type="button"
                      onClick={() => setNewSub(sub)}
                      className="px-1.5 py-0.5 rounded text-[11px] bg-zinc-800 text-zinc-500 hover:text-zinc-300 border border-transparent transition-colors"
                    >
                      r/{sub}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] text-zinc-600 uppercase tracking-widest">
                  Notes <span className="normal-case font-normal">(optional — e.g. "no self-promo on Mon")</span>
                </label>
                <input
                  type="text"
                  value={newNotes}
                  onChange={e => setNewNotes(e.target.value)}
                  placeholder="Any custom notes about posting here..."
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>
              {addError && (
                <p className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">{addError}</p>
              )}
              <Button
                type="submit"
                disabled={adding || !newSub.trim()}
                size="sm"
                className="bg-orange-600 hover:bg-orange-500 w-full"
              >
                {adding
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Adding + fetching rules…</>
                  : <><Plus className="w-3.5 h-3.5" /> Add subreddit (auto-fetch rules)</>
                }
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* Right: ideas generator */}
      <div className="space-y-4 sticky top-8">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Generate ideas</h2>
          <form onSubmit={generateIdeas} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] text-zinc-600 uppercase tracking-widest">Target subreddit</label>
              {configs.length === 0 ? (
                <p className="text-sm text-zinc-500 italic">Add a subreddit on the left first</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {configs.map(cfg => (
                    <button
                      key={cfg.id}
                      type="button"
                      onClick={() => setSelectedSub(cfg.subreddit)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-sm font-medium border transition-all',
                        selectedSub === cfg.subreddit
                          ? 'bg-orange-500/15 text-orange-300 border-orange-500/30'
                          : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600 hover:text-white'
                      )}
                    >
                      r/{cfg.subreddit}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] text-zinc-600 uppercase tracking-widest">
                Topic hint <span className="normal-case font-normal text-zinc-500">(optional)</span>
              </label>
              <input
                type="text"
                value={topicHint}
                onChange={e => setTopicHint(e.target.value)}
                placeholder="e.g. automation, our recent product launch, lessons learned..."
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>

            <Button
              type="submit"
              disabled={generating || !selectedSub}
              className="w-full bg-orange-600 hover:bg-orange-500"
            >
              {generating
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing r/{selectedSub} and generating…</>
                : <><Sparkles className="w-4 h-4" /> Create ideas for r/{selectedSub || '…'}</>
              }
            </Button>

            {genError && (
              <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">{genError}</p>
            )}
            {selectedSub && !selectedConfig?.posting_guidance && (
              <p className="text-xs text-amber-500/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                r/{selectedSub} has no posting guidance yet. Expand it on the left and click Regenerate so ideas match what the sub allows.
              </p>
            )}
          </form>
        </div>

        {/* Ideas list */}
        {ideas.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-zinc-500 px-1">
              {ideas.length} ideas for r/{selectedSub} — click <span className="text-orange-400">Use this</span> to open in the generator
            </p>
            {ideas.map((idea, i) => (
              <div
                key={i}
                className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 space-y-3 hover:border-zinc-600 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-white leading-snug flex-1">{idea.title}</p>
                  <span className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded border font-medium shrink-0',
                    IDEA_TYPE_COLORS[idea.type] ?? 'bg-zinc-800 text-zinc-400 border-zinc-700'
                  )}>
                    {IDEA_TYPE_LABELS[idea.type] ?? idea.type}
                  </span>
                </div>

                <p className="text-xs text-zinc-400 leading-relaxed">{idea.angle}</p>

                <div className="bg-zinc-800/60 rounded-lg p-2.5">
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    <span className="text-zinc-600 font-medium uppercase tracking-wider text-[10px]">Why it works: </span>
                    {idea.why_it_works}
                  </p>
                </div>

                {idea.compliance === 'caution' && (
                  <p className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5">
                    Higher removal risk — review sub guidance before posting.
                  </p>
                )}
                {idea.compliance_note && (
                  <p className="text-[11px] text-zinc-500 leading-relaxed flex items-start gap-1.5">
                    <Check className="w-3 h-3 text-green-500 shrink-0 mt-0.5" />
                    <span>{idea.compliance_note}</span>
                  </p>
                )}

                <Button
                  size="sm"
                  onClick={() => onUseIdea(idea.title, selectedSub)}
                  className="bg-orange-600 hover:bg-orange-500 w-full"
                >
                  Use this idea <ArrowUp className="w-3.5 h-3.5 rotate-90" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {!generating && ideas.length === 0 && selectedSub && (
          <div className="flex flex-col items-center justify-center h-40 border border-dashed border-zinc-800 rounded-xl text-center">
            <Sparkles className="w-7 h-7 text-zinc-700 mb-2" />
            <p className="text-sm text-zinc-500">Ideas will appear here</p>
            <p className="text-xs text-zinc-600 mt-1">
              Reads r/{selectedSub} rules and trending posts to generate on-brand ideas
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Saved posts tab ──────────────────────────────────────────────────────────

function SavedPostsTab({
  companyId,
  refreshKey,
  onContinueEditing,
}: {
  companyId: string
  refreshKey: number
  onContinueEditing: (post: Post) => void
}) {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    fetch(
      `/api/posts?companyId=${companyId}&channel=reddit&status=draft`,
      { signal: controller.signal }
    )
      .then(r => r.json())
      .then(d => setPosts(Array.isArray(d) ? d : []))
      .catch(e => {
        if ((e as Error).name !== 'AbortError') setPosts([])
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [companyId, refreshKey])

  async function handleDelete(post: Post) {
    if (!confirm('Delete this saved post? This cannot be undone.')) return
    const res = await fetch(`/api/posts/${post.id}`, { method: 'DELETE' })
    if (res.ok) setPosts(prev => prev.filter(p => p.id !== post.id))
  }

  return (
    <div className="max-w-3xl">
      <p className="text-sm text-zinc-500 mb-5">
        Reddit posts you saved for later — no schedule required. Open one to keep editing, or schedule when you are ready.
      </p>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 rounded-xl bg-zinc-800/50 animate-pulse" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 border border-dashed border-zinc-800 rounded-xl text-center">
          <Bookmark className="w-10 h-10 text-zinc-700 mb-3" />
          <p className="text-sm text-zinc-400 font-medium">No saved posts yet</p>
          <p className="text-xs text-zinc-600 mt-1 max-w-sm">
            Generate a post and use <span className="text-orange-400">Save for later</span> to keep a draft here without scheduling.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map(post => {
            const reddit = redditFromPost(post)
            const title = reddit?.title ?? post.content.slice(0, 80)
            const sub = reddit?.subreddit
            const expanded = expandedId === post.id

            return (
              <div
                key={post.id}
                className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-700 transition-colors"
              >
                <div className="px-5 py-4 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {sub && (
                        <span className="text-[11px] font-medium text-orange-400/90">r/{sub}</span>
                      )}
                      <span className="text-[11px] text-zinc-600">
                        Saved {formatDistanceToNow(new Date(post.updated_at ?? post.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-white leading-snug line-clamp-2">{title}</p>
                    {reddit?.body && (
                      <p className="text-xs text-zinc-500 mt-1.5 line-clamp-2 leading-relaxed">{reddit.body}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      onClick={() => onContinueEditing(post)}
                      className="bg-orange-600 hover:bg-orange-500"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setExpandedId(expanded ? null : post.id)}
                      title={expanded ? 'Collapse' : 'Preview'}
                    >
                      {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(post)}
                      className="text-red-400 hover:text-red-300"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                {expanded && reddit && (
                  <div className="px-5 pb-4 border-t border-zinc-800 pt-4">
                    <RedditPreview
                      title={reddit.title}
                      body={reddit.body}
                      subreddit={reddit.subreddit}
                      disclosure={reddit.disclosure}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── History tab ─────────────────────────────────────────────────────────────

function HistoryTab({
  companyId,
  onContinueEditing,
}: {
  companyId: string
  onContinueEditing: (post: Post) => void
}) {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    fetch(`/api/posts?companyId=${companyId}&channel=reddit`, { signal: controller.signal })
      .then(r => r.json())
      .then(d => setPosts(Array.isArray(d) ? d : []))
      .catch(e => { if ((e as Error).name !== 'AbortError') setPosts([]) })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [companyId])

  async function handleDelete(post: Post) {
    if (!confirm('Delete this post? This cannot be undone.')) return
    const res = await fetch(`/api/posts/${post.id}`, { method: 'DELETE' })
    if (res.ok) setPosts(prev => prev.filter(p => p.id !== post.id))
  }

  async function handleCopy(post: Post) {
    const reddit = redditFromPost(post)
    const text = reddit ? `${reddit.title}\n\n${reddit.body}` : post.content
    await navigator.clipboard.writeText(text)
    setCopiedId(post.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const STATUS_BADGE: Record<string, string> = {
    draft: 'text-zinc-400 bg-zinc-800',
    scheduled: 'text-yellow-400 bg-yellow-900/30',
    published: 'text-emerald-400 bg-emerald-900/30',
    archived: 'text-zinc-600 bg-zinc-900 border border-zinc-800',
  }

  const allStatuses = ['all', 'draft', 'scheduled', 'published', 'archived']
  const filtered = statusFilter === 'all' ? posts : posts.filter(p => p.status === statusFilter)

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-zinc-500">
          All Reddit posts across every status — drafts, scheduled, published, and archived.
        </p>
        <span className="text-xs text-zinc-600">({posts.length} total)</span>
      </div>

      {/* Status filter pills */}
      <div className="flex gap-1.5 flex-wrap mb-5">
        {allStatuses.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium border transition-all capitalize',
              statusFilter === s
                ? 'bg-orange-600/20 border-orange-600/50 text-orange-300'
                : 'border-zinc-700 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'
            )}
          >
            {s === 'all' ? `All (${posts.length})` : `${s} (${posts.filter(p => p.status === s).length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 rounded-xl bg-zinc-800/50 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 border border-dashed border-zinc-800 rounded-xl text-center">
          <MessageSquare className="w-10 h-10 text-zinc-700 mb-3" />
          <p className="text-sm text-zinc-400 font-medium">
            {statusFilter === 'all' ? 'No Reddit posts yet' : `No ${statusFilter} posts`}
          </p>
          <p className="text-xs text-zinc-600 mt-1">
            {statusFilter === 'all' ? 'Generate a post to see it here' : 'Try a different status filter'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(post => {
            const reddit = redditFromPost(post)
            const title = reddit?.title ?? post.content.slice(0, 80)
            const sub = reddit?.subreddit
            const expanded = expandedId === post.id
            const dateLabel = post.published_at
              ? `Published ${formatDistanceToNow(new Date(post.published_at), { addSuffix: true })}`
              : post.scheduled_for
                ? `Scheduled ${format(new Date(post.scheduled_for), 'MMM d, h:mm a')}`
                : `Created ${formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}`

            return (
              <div
                key={post.id}
                className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-700 transition-colors"
              >
                <div className="px-5 py-4 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      {sub && (
                        <span className="text-[11px] font-semibold text-orange-400/90">r/{sub}</span>
                      )}
                      <span className={cn(
                        'text-[10px] font-medium px-1.5 py-0.5 rounded capitalize',
                        STATUS_BADGE[post.status] ?? 'text-zinc-500 bg-zinc-800'
                      )}>
                        {post.status}
                      </span>
                      <span className="text-[11px] text-zinc-600">{dateLabel}</span>
                    </div>
                    <p className="text-sm font-semibold text-white leading-snug line-clamp-2">{title}</p>
                    {reddit?.body && (
                      <p className="text-xs text-zinc-500 mt-1.5 line-clamp-2 leading-relaxed">{reddit.body}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {(post.status === 'draft' || post.status === 'scheduled') && (
                      <Button
                        size="sm"
                        onClick={() => onContinueEditing(post)}
                        className="bg-orange-600 hover:bg-orange-500"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleCopy(post)}
                      title="Copy content"
                    >
                      {copiedId === post.id
                        ? <Check className="w-3.5 h-3.5 text-green-400" />
                        : <Copy className="w-3.5 h-3.5" />
                      }
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setExpandedId(expanded ? null : post.id)}
                      title={expanded ? 'Collapse' : 'Preview'}
                    >
                      {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(post)}
                      className="text-red-400 hover:text-red-300"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {expanded && reddit && (
                  <div className="px-5 pb-4 border-t border-zinc-800 pt-4">
                    <RedditPreview
                      title={reddit.title}
                      body={reddit.body}
                      subreddit={reddit.subreddit}
                      disclosure={reddit.disclosure}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Main page client ─────────────────────────────────────────────────────────

interface RedditPageClientProps {
  companyId: string
  brandColors?: { primary?: string; accent?: string }
}

export function RedditPageClient({ companyId }: RedditPageClientProps) {
  const [tab, setTab] = useState<Tab>('ideas')
  const [generateKey, setGenerateKey] = useState(0)
  const [prefillTopic, setPrefillTopic] = useState('')
  const [prefillSubreddit, setPrefillSubreddit] = useState('')
  const [draftToEdit, setDraftToEdit] = useState<Post | null>(null)
  const [savedRefreshKey, setSavedRefreshKey] = useState(0)

  function handleUseIdea(topic: string, subreddit: string) {
    setDraftToEdit(null)
    setPrefillTopic(topic)
    setPrefillSubreddit(subreddit)
    setGenerateKey(k => k + 1)
    setTab('generate')
  }

  function handleOpenDraft(post: Post) {
    const reddit = redditFromPost(post)
    setDraftToEdit(post)
    setPrefillTopic(reddit?.title ?? '')
    setPrefillSubreddit(reddit?.subreddit ?? '')
    setGenerateKey(k => k + 1)
    setTab('generate')
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'ideas', label: 'Ideas', icon: <Sparkles className="w-3.5 h-3.5" /> },
    { id: 'generate', label: 'Generate', icon: <MessageSquare className="w-3.5 h-3.5" /> },
    { id: 'saved', label: 'Saved', icon: <Bookmark className="w-3.5 h-3.5" /> },
    { id: 'history', label: 'History', icon: <History className="w-3.5 h-3.5" /> },
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
        {tab === 'ideas' && (
          <IdeasTab companyId={companyId} onUseIdea={handleUseIdea} />
        )}
        {tab === 'generate' && (
          <GenerateTab
            key={`${generateKey}-${draftToEdit?.id ?? 'new'}`}
            companyId={companyId}
            initialTopic={prefillTopic}
            initialSubreddit={prefillSubreddit}
            initialDraft={draftToEdit}
            onDraftSaved={() => setSavedRefreshKey(k => k + 1)}
          />
        )}
        {tab === 'saved' && (
          <SavedPostsTab
            companyId={companyId}
            refreshKey={savedRefreshKey}
            onContinueEditing={handleOpenDraft}
          />
        )}
        {tab === 'history' && (
          <HistoryTab
            companyId={companyId}
            onContinueEditing={handleOpenDraft}
          />
        )}
        {tab === 'opportunities' && <OpportunitiesTab companyId={companyId} />}
        {tab === 'monitors' && <MonitorsTab companyId={companyId} />}
      </div>
    </div>
  )
}
  