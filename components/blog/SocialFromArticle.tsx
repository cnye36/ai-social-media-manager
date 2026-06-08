'use client'

import { useState } from 'react'
import { X, Loader2, Check, Send, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LinkedInIcon, XIcon, RedditIcon, FacebookIcon } from '@/components/ui/channel-icons'
import type { Channel } from '@/types/database'

const CHANNELS: { id: Channel; label: string; icon: React.ReactNode }[] = [
  { id: 'linkedin', label: 'LinkedIn', icon: <LinkedInIcon className="w-3.5 h-3.5" /> },
  { id: 'x', label: 'X / Twitter', icon: <XIcon className="w-3.5 h-3.5" /> },
  { id: 'facebook', label: 'Facebook', icon: <FacebookIcon className="w-3.5 h-3.5" /> },
  { id: 'reddit', label: 'Reddit', icon: <RedditIcon className="w-3.5 h-3.5" /> },
]

interface Draft {
  channel: Channel
  content: string
  saving: boolean
  saved: boolean
  error: string
}

interface SocialFromArticleProps {
  articleId: string
  companyId: string
  defaultOpen?: boolean
}

export function SocialFromArticle({ articleId, companyId, defaultOpen = false }: SocialFromArticleProps) {
  const [open, setOpen] = useState(defaultOpen)
  const [selectedChannels, setSelectedChannels] = useState<Channel[]>(['linkedin', 'x'])
  const [generating, setGenerating] = useState(false)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [generateError, setGenerateError] = useState('')

  function toggleChannel(ch: Channel) {
    setSelectedChannels(prev =>
      prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]
    )
  }

  async function generate() {
    if (!selectedChannels.length) return
    setGenerating(true)
    setGenerateError('')
    setDrafts([])
    try {
      const res = await fetch(`/api/articles/${articleId}/social`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels: selectedChannels }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to generate')
      setDrafts(
        (data.drafts as { channel: Channel; content: string }[]).map(d => ({
          ...d,
          saving: false,
          saved: false,
          error: '',
        }))
      )
    } catch (e) {
      setGenerateError((e as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  function updateDraftContent(idx: number, content: string) {
    setDrafts(prev => prev.map((d, i) => i === idx ? { ...d, content } : d))
  }

  async function saveDraft(idx: number) {
    const draft = drafts[idx]
    setDrafts(prev => prev.map((d, i) => i === idx ? { ...d, saving: true, error: '' } : d))
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          channel: draft.channel,
          content: draft.content,
          status: 'draft',
          ai_generated: true,
          generation_params: { source: 'article', articleId },
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Save failed')
      }
      setDrafts(prev => prev.map((d, i) => i === idx ? { ...d, saving: false, saved: true } : d))
    } catch (e) {
      setDrafts(prev => prev.map((d, i) => i === idx ? { ...d, saving: false, error: (e as Error).message } : d))
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
          <span className="text-xs text-zinc-500">Generate posts from this article</span>
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

          {generateError && <p className="text-xs text-red-400">{generateError}</p>}

          {/* Draft cards */}
          {drafts.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs text-zinc-500">Review and edit each draft, then save the ones you want:</p>
              {drafts.map((draft, i) => (
                <div
                  key={i}
                  className={cn(
                    'rounded-xl border p-3 space-y-2 transition-colors',
                    draft.saved ? 'border-green-500/30 bg-green-950/10' : 'border-zinc-800 bg-zinc-900/50'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <Badge variant={draft.channel}>{draft.channel}</Badge>
                    {draft.saved && (
                      <span className="flex items-center gap-1 text-xs text-green-400 font-medium">
                        <Check className="w-3.5 h-3.5" />
                        Saved as draft
                      </span>
                    )}
                  </div>
                  <textarea
                    value={draft.content}
                    onChange={e => updateDraftContent(i, e.target.value)}
                    rows={4}
                    disabled={draft.saved}
                    className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-300 leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-violet-500/60 disabled:opacity-60"
                  />
                  {draft.error && <p className="text-xs text-red-400">{draft.error}</p>}
                  {!draft.saved && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => saveDraft(i)}
                      disabled={draft.saving}
                      className="gap-1.5"
                    >
                      {draft.saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      {draft.saving ? 'Saving…' : 'Save as draft'}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
