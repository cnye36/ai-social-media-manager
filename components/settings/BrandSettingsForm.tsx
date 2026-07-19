'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { X, Plus, Trash2 } from 'lucide-react'
import type { AccountType, BrandProfile, Channel, FounderProject } from '@/types/database'

const TONES = ['professional', 'casual', 'witty', 'authoritative', 'friendly', 'bold']
const CHANNELS: Channel[] = ['linkedin', 'x', 'reddit', 'facebook']
const STAGES = ['Pre-launch', 'Startup', 'Growth', 'Established', 'Enterprise']
const TEAM_SIZES = ['1–5', '6–20', '21–50', '51–200', '200+']
const EMPTY_PROJECT: FounderProject = { name: '', description: '', url: null, promo_angle: null }

interface BrandSettingsFormProps {
  companyId: string
  initialData: BrandProfile | null
  accountType: AccountType
}

export function BrandSettingsForm({ companyId, initialData, accountType }: BrandSettingsFormProps) {
  // Founder profile
  const [bio, setBio] = useState(initialData?.bio ?? '')
  const [projects, setProjects] = useState<FounderProject[]>(initialData?.projects ?? [])
  // Voice & tone
  const [tone, setTone] = useState(initialData?.tone ?? 'professional')
  const [voiceNotes, setVoiceNotes] = useState(initialData?.voice_notes ?? '')
  const [targetAudience, setTargetAudience] = useState(initialData?.target_audience ?? '')
  const [keywords, setKeywords] = useState<string[]>(initialData?.keywords ?? [])
  const [avoidPhrases, setAvoidPhrases] = useState<string[]>(initialData?.avoid_phrases ?? [])
  const [colorPrimary, setColorPrimary] = useState(initialData?.color_palette?.primary ?? '#7c3aed')
  const [colorAccent, setColorAccent] = useState(initialData?.color_palette?.accent ?? '#a78bfa')

  // Company intel
  const [companyDescription, setCompanyDescription] = useState(initialData?.company_description ?? '')
  const [productsServices, setProductsServices] = useState(initialData?.products_services ?? '')
  const [valueProposition, setValueProposition] = useState(initialData?.value_proposition ?? '')
  const [idealCustomerProfile, setIdealCustomerProfile] = useState(initialData?.ideal_customer_profile ?? '')
  const [painPoints, setPainPoints] = useState<string[]>(initialData?.pain_points ?? [])
  const [competitors, setCompetitors] = useState<string[]>(initialData?.competitors ?? [])
  const [geographicFocus, setGeographicFocus] = useState(initialData?.geographic_focus ?? '')
  const [companyStage, setCompanyStage] = useState(initialData?.company_stage ?? '')
  const [teamSize, setTeamSize] = useState(initialData?.team_size ?? '')
  const [preferredStack, setPreferredStack] = useState(initialData?.preferred_stack ?? '')

  // Tag inputs
  const [keywordInput, setKeywordInput] = useState('')
  const [avoidInput, setAvoidInput] = useState('')
  const [painInput, setPainInput] = useState('')
  const [competitorInput, setCompetitorInput] = useState('')

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

  function updateProject(index: number, patch: Partial<FounderProject>) {
    setProjects(projects.map((p, i) => (i === index ? { ...p, ...patch } : p)))
  }

  function removeProject(index: number) {
    setProjects(projects.filter((_, i) => i !== index))
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
        company_description: companyDescription,
        products_services: productsServices,
        value_proposition: valueProposition,
        ideal_customer_profile: idealCustomerProfile,
        pain_points: painPoints,
        competitors,
        geographic_focus: geographicFocus,
        company_stage: companyStage,
        team_size: teamSize,
        preferred_stack: preferredStack.trim() || null,
        bio: bio.trim() || null,
        projects: projects.filter(p => p.name.trim() && p.description.trim()),
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
    <div className="space-y-10">

      {accountType === 'founder' && (
        <>
          {/* ── Founder Profile ────────────────────────────── */}
          <section className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Founder profile</h3>
              <p className="text-xs text-zinc-500 mt-0.5">Your voice as an individual — used to write personal, first-person posts</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bio">Bio <span className="text-zinc-500 font-normal text-xs">(who you are, what you do, your background)</span></Label>
              <Textarea
                id="bio"
                value={bio}
                onChange={e => setBio(e.target.value)}
                placeholder="I'm a founder building an AI automation agency and a SaaS product on the side. I write about..."
                rows={4}
              />
            </div>

            <div className="space-y-3">
              <Label>Projects <span className="text-zinc-500 font-normal text-xs">(the AI will occasionally, subtly plug these — never every post)</span></Label>
              {projects.map((project, i) => (
                <div key={i} className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/50 space-y-2">
                  <div className="flex items-start gap-2">
                    <Input
                      value={project.name}
                      onChange={e => updateProject(i, { name: e.target.value })}
                      placeholder="Project name"
                      className="flex-1"
                    />
                    <button onClick={() => removeProject(i)} className="p-2 text-zinc-500 hover:text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <Textarea
                    value={project.description}
                    onChange={e => updateProject(i, { description: e.target.value })}
                    placeholder="What it does, who it's for"
                    rows={2}
                  />
                  <Input
                    value={project.url ?? ''}
                    onChange={e => updateProject(i, { url: e.target.value || null })}
                    placeholder="https://..."
                    type="url"
                  />
                  <Input
                    value={project.promo_angle ?? ''}
                    onChange={e => updateProject(i, { promo_angle: e.target.value || null })}
                    placeholder="When to mention it (e.g. when talking about automation or agency ops)"
                  />
                </div>
              ))}
              <Button variant="secondary" size="sm" onClick={() => setProjects([...projects, { ...EMPTY_PROJECT }])}>
                <Plus className="w-4 h-4 mr-2" />
                Add project
              </Button>
            </div>
          </section>

          <hr className="border-zinc-800" />
        </>
      )}

      {/* ── Company Intel ──────────────────────────────── */}
      <section className="space-y-6">
        <div>
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Company intel</h3>
          <p className="text-xs text-zinc-500 mt-0.5">Everything the AI should know about who you are and what you do</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="company-desc">Company description <span className="text-zinc-500 font-normal text-xs">(what you do, at a glance)</span></Label>
          <Textarea
            id="company-desc"
            value={companyDescription}
            onChange={e => setCompanyDescription(e.target.value)}
            placeholder="We build B2B SaaS tools that help operations teams automate repetitive workflows without writing code..."
            rows={3}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="preferred-stack">
            Preferred tech stack{' '}
            <span className="text-zinc-500 font-normal text-xs">(used by all AI writers — Reddit, LinkedIn, etc.)</span>
          </Label>
          <Input
            id="preferred-stack"
            value={preferredStack}
            onChange={e => setPreferredStack(e.target.value)}
            placeholder="TypeScript, React, Next.js"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="products">Products & services</Label>
          <Textarea
            id="products"
            value={productsServices}
            onChange={e => setProductsServices(e.target.value)}
            placeholder="List your key offerings — products, plans, services, pricing tiers, etc. The more detail, the better..."
            rows={4}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="value-prop">Unique value proposition <span className="text-zinc-500 font-normal text-xs">(what makes you different)</span></Label>
          <Textarea
            id="value-prop"
            value={valueProposition}
            onChange={e => setValueProposition(e.target.value)}
            placeholder="Unlike legacy tools that require 6-month implementations, ours deploys in a day with zero IT involvement..."
            rows={3}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="icp">Ideal customer profile</Label>
          <Textarea
            id="icp"
            value={idealCustomerProfile}
            onChange={e => setIdealCustomerProfile(e.target.value)}
            placeholder="Operations managers at 50–500 person companies in logistics or manufacturing. They're frustrated by spreadsheets and legacy ERP systems. They care about ROI and fast time-to-value..."
            rows={4}
          />
        </div>

        {/* Pain points */}
        <div className="space-y-1.5">
          <Label>Pain points you solve <span className="text-zinc-500 font-normal text-xs">(problems your customers have)</span></Label>
          <div className="flex gap-2">
            <Input
              value={painInput}
              onChange={e => setPainInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag(painPoints, setPainPoints, painInput, setPainInput))}
              placeholder="Manual data entry, siloed systems, slow approvals..."
            />
            <Button variant="secondary" size="sm" onClick={() => addTag(painPoints, setPainPoints, painInput, setPainInput)}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {painPoints.map(p => (
              <span key={p} className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-600/15 text-amber-300 rounded-full text-xs">
                {p}
                <button onClick={() => removeTag(painPoints, setPainPoints, p)} className="hover:text-white"><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
        </div>

        {/* Competitors */}
        <div className="space-y-1.5">
          <Label>Competitors <span className="text-zinc-500 font-normal text-xs">(so the AI avoids praising them)</span></Label>
          <div className="flex gap-2">
            <Input
              value={competitorInput}
              onChange={e => setCompetitorInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag(competitors, setCompetitors, competitorInput, setCompetitorInput))}
              placeholder="Competitor name..."
            />
            <Button variant="secondary" size="sm" onClick={() => addTag(competitors, setCompetitors, competitorInput, setCompetitorInput)}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {competitors.map(c => (
              <span key={c} className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-700 text-zinc-300 rounded-full text-xs">
                {c}
                <button onClick={() => removeTag(competitors, setCompetitors, c)} className="hover:text-white"><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="geo">Geographic focus</Label>
            <Input
              id="geo"
              value={geographicFocus}
              onChange={e => setGeographicFocus(e.target.value)}
              placeholder="North America, global, EMEA..."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="stage">Company stage</Label>
            <select
              id="stage"
              value={companyStage}
              onChange={e => setCompanyStage(e.target.value)}
              className="w-full h-9 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="">Select stage</option>
              {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="team">Team size</Label>
            <select
              id="team"
              value={teamSize}
              onChange={e => setTeamSize(e.target.value)}
              className="w-full h-9 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="">Select size</option>
              {TEAM_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </section>

      <hr className="border-zinc-800" />

      {/* ── Brand Voice ────────────────────────────────── */}
      <section className="space-y-6">
        <div>
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Brand voice</h3>
          <p className="text-xs text-zinc-500 mt-0.5">How you speak — tone, style, what to say and avoid</p>
        </div>

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

        <div className="space-y-1.5">
          <Label htmlFor="voice">Brand voice notes <span className="text-zinc-500 font-normal text-xs">(personality, style quirks, examples)</span></Label>
          <Textarea
            id="voice"
            value={voiceNotes}
            onChange={e => setVoiceNotes(e.target.value)}
            placeholder="We're a scrappy startup that speaks plainly, backs claims with data, and never uses corporate buzzwords..."
            rows={4}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="audience">Target audience</Label>
          <Input
            id="audience"
            value={targetAudience}
            onChange={e => setTargetAudience(e.target.value)}
            placeholder="SaaS founders, B2B marketing managers, early-stage startup teams"
          />
        </div>

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
      </section>

      {saveError && <p className="text-sm text-red-400">{saveError}</p>}
      <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
        {saving ? 'Saving...' : saved ? 'Saved!' : 'Save brand profile'}
      </Button>
    </div>
  )
}
