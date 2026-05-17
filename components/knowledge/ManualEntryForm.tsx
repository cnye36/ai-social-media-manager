'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { CheckCircle } from 'lucide-react'

interface ManualEntryFormProps {
  companyId: string
  onComplete?: () => void
}

export function ManualEntryForm({ companyId, onComplete }: ManualEntryFormProps) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/knowledge/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, title, content }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? 'Something went wrong')
      return
    }

    setSaved(true)
    setTitle('')
    setContent('')
    onComplete?.()
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="entry-title">Title <span className="text-zinc-500 font-normal text-xs">(optional)</span></Label>
        <Input
          id="entry-title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Product overview, Team bio, FAQ..."
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="entry-content">Content</Label>
        <Textarea
          id="entry-content"
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Paste any text: product descriptions, company bios, press releases, FAQs, talking points..."
          rows={6}
          required
        />
        <p className="text-xs text-zinc-500">
          {content.length > 0 && `~${Math.ceil(content.split(/\s+/).length / 150)} chunk${Math.ceil(content.split(/\s+/).length / 150) !== 1 ? 's' : ''} will be created`}
        </p>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {saved && (
        <div className="flex items-center gap-2 text-green-400 text-sm">
          <CheckCircle className="w-4 h-4" />
          Added to knowledge base
        </div>
      )}

      <Button type="submit" disabled={loading || !content.trim()}>
        {loading ? 'Adding...' : 'Add to knowledge base'}
      </Button>
    </form>
  )
}
