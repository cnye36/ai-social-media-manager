'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { X, Plus } from 'lucide-react'
import type { BrandProfile, Channel } from '@/types/database'

const TONES = ['professional', 'casual', 'witty', 'authoritative', 'friendly', 'bold']
const CHANNELS: Channel[] = ['linkedin', 'x', 'reddit', 'facebook']

interface BrandFormProps {
  companyId: string
  initialData: BrandProfile | null
}

export function BrandForm({ companyId, initialData }: BrandFormProps) {
  const [tone, setTone] = useState(initialData?.tone ?? 'professional')
  const [voiceNotes, setVoiceNotes] = useState(initialData?.voice_notes ?? '')
  const [targetAudience, setTargetAudience] = useState(initialData?.target_audience ?? '')
  const [keywords, setKeywords] = useState<string[]>(initialData?.keywords ?? [])
  const [avoidPhrases, setAvoidPhrases] = useState<string[]>(initialData?.avoid_phrases ?? [])
  const [colorPrimary, setColorPrimary] = useState(initialData?.color_palette?.primary ?? '#7c3aed')
  const [colorAccent, setColorAccent] = useState(initialData?.color_palette?.accent ?? '#a78bfa')
  const [keywordInput, setKeywordInput] = useState('')
  const [avoidInput, setAvoidInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  function addTag(list: string[], setList: (v: string[]) => void, input: string, setInput: (v: string) => void) {
    const val = input.trim()
    if (val && !list.includes(val)) setList([...list, val])
    setInput('')
  }

  function removeTag(list: string[], setList: (v: string[]) => void, item: string) {
    setList(list.filter(t => t !== item))
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    setSaveError(null)
    const res = await fetch(`/api/brand?companyId=${companyId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tone,
        voice_notes: voiceNotes,
        target_audience: targetAudience,
        keywords,
        avoid_phrases: avoidPhrases,
        color_palette: { primary: colorPrimary, accent: colorAccent },
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setSaveError(typeof body.error === 'string' ? body.error : 'Failed to save brand profile')
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-8">
      {/* Tone */}
      <div className="space-y-2">
        <Label>Brand tone</Label>
        <div className="flex flex-wrap gap-2">
          {TONES.map(t => (
            <button
              key={t}
              onClick={() => setTone(t)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
                tone === t
                  ? 'bg-violet-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Voice */}
      <div className="space-y-1.5">
        <Label htmlFor="voice">Brand voice <span className="text-zinc-500 font-normal text-xs">(describe your brand personality)</span></Label>
        <Textarea
          id="voice"
          value={voiceNotes}
          onChange={e => setVoiceNotes(e.target.value)}
          placeholder="We're a scrappy startup that speaks plainly, backs claims with data, and never uses corporate buzzwords..."
          rows={4}
        />
      </div>

      {/* Target audience */}
      <div className="space-y-1.5">
        <Label htmlFor="audience">Target audience</Label>
        <Input
          id="audience"
          value={targetAudience}
          onChange={e => setTargetAudience(e.target.value)}
          placeholder="SaaS founders, B2B marketing managers, early-stage startup teams"
        />
      </div>

      {/* Keywords */}
      <div className="space-y-1.5">
        <Label>Brand keywords <span className="text-zinc-500 font-normal text-xs">(always weave in)</span></Label>
        <div className="flex gap-2">
          <Input
            value={keywordInput}
            onChange={e => setKeywordInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag(keywords, setKeywords, keywordInput, setKeywordInput))}
            placeholder="Type a keyword and press Enter"
          />
          <Button variant="secondary" size="sm" onClick={() => addTag(keywords, setKeywords, keywordInput, setKeywordInput)}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {keywords.map(kw => (
            <span key={kw} className="flex items-center gap-1.5 px-2.5 py-1 bg-violet-600/15 text-violet-300 rounded-full text-xs">
              {kw}
              <button onClick={() => removeTag(keywords, setKeywords, kw)} className="hover:text-white"><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      </div>

      {/* Avoid phrases */}
      <div className="space-y-1.5">
        <Label>Phrases to avoid</Label>
        <div className="flex gap-2">
          <Input
            value={avoidInput}
            onChange={e => setAvoidInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag(avoidPhrases, setAvoidPhrases, avoidInput, setAvoidInput))}
            placeholder="synergy, disruptive, game-changer..."
          />
          <Button variant="secondary" size="sm" onClick={() => addTag(avoidPhrases, setAvoidPhrases, avoidInput, setAvoidInput)}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {avoidPhrases.map(p => (
            <span key={p} className="flex items-center gap-1.5 px-2.5 py-1 bg-red-600/15 text-red-300 rounded-full text-xs">
              {p}
              <button onClick={() => removeTag(avoidPhrases, setAvoidPhrases, p)} className="hover:text-white"><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      </div>

      {/* Colors */}
      <div className="space-y-2">
        <Label>Brand colors</Label>
        <div className="flex gap-6">
          <div className="flex items-center gap-3">
            <input type="color" value={colorPrimary} onChange={e => setColorPrimary(e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-0" />
            <div>
              <p className="text-xs text-zinc-400">Primary</p>
              <p className="text-sm text-white font-mono">{colorPrimary}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input type="color" value={colorAccent} onChange={e => setColorAccent(e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-0" />
            <div>
              <p className="text-xs text-zinc-400">Accent</p>
              <p className="text-sm text-white font-mono">{colorAccent}</p>
            </div>
          </div>
        </div>
      </div>

      {saveError && (
        <p className="text-sm text-red-400">{saveError}</p>
      )}
      <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
        {saving ? 'Saving...' : saved ? 'Saved!' : 'Save brand profile'}
      </Button>
    </div>
  )
}
