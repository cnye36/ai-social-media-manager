'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { format } from 'date-fns'
import {
  ArrowLeft, Loader2, Trash2, CalendarClock, Sparkles, Check,
  Tag, X, Copy, Wand2, ChevronDown, ChevronUp, ExternalLink,
  Code2, BookOpen, LayoutList, Microscope, ImageIcon, Gauge,
} from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { RichTextEditor, type RichTextEditorHandle } from './RichTextEditor'
import { ArticleMediaPanel } from './ArticleMediaPanel'
import { SocialFromArticle } from './SocialFromArticle'
import { AltTextBox } from '@/components/media/AltTextBox'
import { stripImagePromptComments } from '@/lib/blog/image-prompts'
import { buildArticlePublicUrl } from '@/lib/blog/article-url'
import type { MediaResult } from '@/types/media'
import { cn } from '@/lib/utils'
import type { Article, ArticleStatus, BlogSite } from '@/types/database'
import {
  buildStatusDatetimePayload,
  datetimeFieldLabel,
  initialDatetimeLocal,
  onDatetimeChange,
  onStatusSelect,
  syncDatetimeFieldsFromSaved,
} from '@/lib/content-status'
import type { ArticleFormat } from '@/types/agents'
import type { GeneratedFrontmatter } from '@/app/api/generate/article/route'
import { buildArticleFrontmatter } from '@/lib/blog/frontmatter'
import type { ArticleScore, ArticleIssue } from '@/lib/blog/score-article'

const FORMAT_OPTIONS: { value: ArticleFormat; label: string; icon: React.ReactNode }[] = [
  { value: 'blog_post', label: 'Blog Post', icon: <BookOpen className="w-3 h-3" /> },
  { value: 'listicle', label: 'Listicle', icon: <LayoutList className="w-3 h-3" /> },
  { value: 'deep_dive', label: 'Deep Dive', icon: <Microscope className="w-3 h-3" /> },
]

const STATUSES: ArticleStatus[] = ['draft', 'scheduled', 'published', 'archived']

function titleToSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 80)
}

interface ArticleEditorClientProps {
  article: Article
  companyId: string
  sites: BlogSite[]
  brandColors?: { primary?: string; accent?: string }
  autoGenerate?: boolean
}

export function ArticleEditorClient({
  article: initialArticle, companyId, sites, brandColors, autoGenerate = false,
}: ArticleEditorClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editorRef = useRef<RichTextEditorHandle>(null)

  // Content
  const [title, setTitle] = useState(initialArticle.title)
  const [excerpt, setExcerpt] = useState(initialArticle.excerpt ?? '')

  // Frontmatter
  const [slug, setSlug] = useState(initialArticle.slug ?? '')
  const [metaTitle, setMetaTitle] = useState(initialArticle.meta_title ?? initialArticle.title)
  const [metaDescription, setMetaDescription] = useState(initialArticle.meta_description ?? '')
  const [categories, setCategories] = useState<string[]>(initialArticle.categories ?? [])
  const [tags, setTags] = useState<string[]>(initialArticle.tags ?? [])
  const [author, setAuthor] = useState(initialArticle.author ?? '')
  const [featuredImageAlt, setFeaturedImageAlt] = useState('')
  const [featuredImageUrl, setFeaturedImageUrl] = useState(initialArticle.featured_image_url ?? '')
  const [featuredImagePrompt, setFeaturedImagePrompt] = useState(initialArticle.featured_image_prompt ?? '')
  const [coverSuggestedPrompt, setCoverSuggestedPrompt] = useState(initialArticle.featured_image_prompt ?? '')
  const [inlineSuggestedPrompt, setInlineSuggestedPrompt] = useState('')
  const [showInlineMedia, setShowInlineMedia] = useState(false)
  const [catInput, setCatInput] = useState('')
  const [tagInput, setTagInput] = useState('')

  // Publishing
  const [selectedSiteId, setSelectedSiteId] = useState(initialArticle.site_id ?? sites[0]?.id ?? '')
  const [status, setStatus] = useState<ArticleStatus>(initialArticle.status)
  const [scheduledFor, setScheduledFor] = useState(
    initialDatetimeLocal(initialArticle.status, initialArticle.scheduled_for, initialArticle.published_at),
  )

  // UI state
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')
  const [aiEditOpen, setAiEditOpen] = useState(false)
  const [aiInstruction, setAiInstruction] = useState('')
  const [aiEditing, setAiEditing] = useState(false)
  const [wordCount, setWordCount] = useState(0)
  const [editorBody, setEditorBody] = useState(initialArticle.body)
  const [copied, setCopied] = useState(false)
  const [frontmatterOpen, setFrontmatterOpen] = useState(true)
  const [qualityOpen, setQualityOpen] = useState(false)
  const [articleScore, setArticleScore] = useState<ArticleScore | null>(null)
  const [scoring, setScoring] = useState(false)
  const [scoreError, setScoreError] = useState('')
  const [fixingIssueIndex, setFixingIssueIndex] = useState<number | null>(null)
  const [mdxViewOpen, setMdxViewOpen] = useState(false)
  const [mdxCopied, setMdxCopied] = useState(false)
  const [articleFormat, setArticleFormat] = useState<ArticleFormat>(
    (searchParams.get('format') as ArticleFormat | null) ?? 'blog_post'
  )
  const [editorViewMode, setEditorViewMode] = useState<'edit' | 'preview'>('edit')

  const selectedSite = sites.find(s => s.id === selectedSiteId)
  const slugPreview = selectedSite
    ? buildArticlePublicUrl(selectedSite.base_url, slug || 'your-slug')
    : slug

  // Auto-generate on first load if requested
  const hasAutoTriggered = useRef(false)
  useEffect(() => {
    const shouldGenerate = autoGenerate || searchParams.get('autoGenerate') === 'true'
    if (shouldGenerate && !hasAutoTriggered.current && !initialArticle.body && title) {
      hasAutoTriggered.current = true
      void handleGenerate()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Author default from site
  useEffect(() => {
    if (!author && selectedSite?.default_author) setAuthor(selectedSite.default_author)
  }, [selectedSite, author])

  // Word count from editor content
  const handleEditorChange = useCallback((markdown: string) => {
    setEditorBody(markdown)
    setWordCount(markdown.split(/\s+/).filter(Boolean).length)
  }, [])

  function addTag(input: string, list: string[], setList: (v: string[]) => void, setInput: (v: string) => void) {
    const val = input.trim()
    if (val && !list.map(v => v.toLowerCase()).includes(val.toLowerCase())) setList([...list, val])
    setInput('')
  }

  function removeItem(val: string, list: string[], setList: (v: string[]) => void) {
    setList(list.filter(v => v !== val))
  }

  // Auto-suggest slug from title
  useEffect(() => {
    if (!slug && title) setSlug(titleToSlug(title))
  }, [title, slug])

  async function handleGenerate() {
    if (!title.trim()) { setGenerateError('Add a title first'); return }
    setGenerating(true)
    setGenerateError('')
    const res = await fetch('/api/generate/article', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId,
        title,
        additionalContext: excerpt || undefined,
        siteId: selectedSiteId || undefined,
        articleFormat,
      }),
    })
    if (res.ok) {
      const data = await res.json() as { body: string; frontmatter: GeneratedFrontmatter; defaultAuthor?: string }
      const body = stripImagePromptComments(data.body?.trim() ?? '')
      if (!body) {
        setGenerateError('Generation finished but the article body was empty — try again')
      } else {
        editorRef.current?.setMarkdown(body)
        handleEditorChange(body)
      }
      setMetaTitle(data.frontmatter.metaTitle)
      setMetaDescription(data.frontmatter.metaDescription)
      if (!slug) setSlug(data.frontmatter.slug)
      setCategories(data.frontmatter.categories)
      setTags(data.frontmatter.tags)
      if (data.defaultAuthor && !author) setAuthor(data.defaultAuthor)
      setExcerpt(data.frontmatter.metaDescription)
      if (data.frontmatter.featuredImageAlt) setFeaturedImageAlt(data.frontmatter.featuredImageAlt)
      if (data.frontmatter.coverImagePrompt) {
        setCoverSuggestedPrompt(data.frontmatter.coverImagePrompt)
        setFeaturedImagePrompt(data.frontmatter.coverImagePrompt)
      }
      // Auto-save the generated content
      if (body) {
        const saveRes = await fetch(`/api/articles/${initialArticle.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            body,
            excerpt: data.frontmatter.metaDescription || null,
            tags: data.frontmatter.tags,
            categories: data.frontmatter.categories,
            slug: data.frontmatter.slug || null,
            meta_title: data.frontmatter.metaTitle || null,
            meta_description: data.frontmatter.metaDescription || null,
            featured_image_prompt: data.frontmatter.coverImagePrompt || null,
          }),
        })
        if (saveRes.ok) setSaveSuccess(true)
        void handleScoreArticle(body)
      }
    } else {
      const d = await res.json().catch(() => ({}))
      setGenerateError(typeof d.error === 'string' ? d.error : 'Generation failed')
    }
    setGenerating(false)
  }

  async function handleAiEdit() {
    if (!aiInstruction.trim()) return
    setAiEditing(true)
    const currentBody = editorRef.current?.getMarkdown() ?? ''
    const res = await fetch('/api/generate/article/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, currentBody, instruction: aiInstruction }),
    })
    if (res.ok) {
      const data = await res.json() as { body: string }
      const edited = stripImagePromptComments(data.body?.trim() ?? '')
      editorRef.current?.setMarkdown(edited)
      setAiInstruction('')
      setAiEditOpen(false)
    }
    setAiEditing(false)
  }

  async function handleSave() {
    setSaving(true)
    setSaveError('')
    setSaveSuccess(false)
    const body = editorRef.current?.getMarkdown() ?? initialArticle.body
    const res = await fetch(`/api/articles/${initialArticle.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title, body, excerpt: excerpt || null, tags, categories,
        slug: slug || null, site_id: selectedSiteId || null,
        meta_title: metaTitle || null, meta_description: metaDescription || null,
        author: author || null,
        ...buildStatusDatetimePayload(status, scheduledFor),
        featured_image_url: featuredImageUrl || null,
        featured_image_prompt: featuredImagePrompt || null,
      }),
    })
    if (res.ok) {
      const updated = await res.json() as Article
      setStatus(updated.status)
      setScheduledFor(syncDatetimeFieldsFromSaved(updated))
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2500)
    } else {
      const d = await res.json().catch(() => ({}))
      setSaveError(typeof d.error === 'string' ? d.error : 'Failed to save')
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!confirm('Delete this article? This cannot be undone.')) return
    await fetch(`/api/articles/${initialArticle.id}`, { method: 'DELETE' })
    router.push(`/${companyId}/blog`)
  }

  async function handleScoreArticle(bodyOverride?: string) {
    const body = bodyOverride ?? editorRef.current?.getMarkdown() ?? editorBody
    if (!body.trim()) return
    setScoring(true)
    setScoreError('')
    try {
      const res = await fetch('/api/articles/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body }),
      })
      if (res.ok) {
        setArticleScore(await res.json() as ArticleScore)
      } else {
        const d = await res.json().catch(() => ({}))
        setScoreError(typeof d.error === 'string' ? d.error : 'Check failed')
      }
    } catch {
      setScoreError('Check failed')
    } finally {
      setScoring(false)
    }
  }

  async function handleFixIssue(issue: ArticleIssue, index: number) {
    setFixingIssueIndex(index)
    const currentBody = editorRef.current?.getMarkdown() ?? editorBody
    const categoryLabel = articleScore?.categories.find(c => c.key === issue.category)?.label ?? issue.category
    const instruction = `Fix only this specific issue. Make the smallest possible edit and leave the rest of the article untouched:\n\n[${categoryLabel}] ${issue.note}`
    const res = await fetch('/api/generate/article/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, currentBody, instruction }),
    })
    if (res.ok) {
      const data = await res.json() as { body: string }
      const edited = stripImagePromptComments(data.body?.trim() ?? '')
      editorRef.current?.setMarkdown(edited)
      handleEditorChange(edited)
      await fetch(`/api/articles/${initialArticle.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: edited }),
      })
      await handleScoreArticle(edited)
    }
    setFixingIssueIndex(null)
  }

  function openInlineImagePanel() {
    const section = editorRef.current?.getSelectionContext() ?? ''
    setInlineSuggestedPrompt(section.slice(0, 500))
    setShowInlineMedia(true)
  }

  async function handleCoverImage(result: MediaResult) {
    setFeaturedImageUrl(result.url)
    setFeaturedImagePrompt(result.promptUsed)
    setFeaturedImageAlt(result.altText)
    await fetch(`/api/articles/${initialArticle.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        featured_image_url: result.url,
        featured_image_prompt: result.promptUsed,
      }),
    })
  }

  async function handleInlineImage(result: MediaResult) {
    editorRef.current?.insertImage(result.url, result.altText)
    setShowInlineMedia(false)
    const body = editorRef.current?.getMarkdown() ?? editorBody
    setEditorBody(body)
    await fetch(`/api/articles/${initialArticle.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    })
  }

  function buildMdxContent() {
    const rawBody = editorRef.current?.getMarkdown() ?? ''
    const body = stripImagePromptComments(rawBody)
    const articleDate = scheduledFor
      ? format(new Date(scheduledFor), 'yyyy-MM-dd')
      : format(new Date(), 'yyyy-MM-dd')
    const articleSlug = slug || titleToSlug(title)

    const frontmatter = buildArticleFrontmatter({
      metaTitle: metaTitle || title,
      metaDescription,
      date: articleDate,
      author,
      categories,
      tags,
      slug: articleSlug,
      featuredImageAlt: featuredImageAlt || `Featured image for ${title}`,
      featuredImageSrc: featuredImageUrl || undefined,
      template: selectedSite?.frontmatter_template,
    })

    return `${frontmatter}\n\n${body}`
  }

  function handleCopyMdx() {
    navigator.clipboard.writeText(buildMdxContent())
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  function handleCopyFullMdx() {
    navigator.clipboard.writeText(buildMdxContent())
    setMdxCopied(true)
    setTimeout(() => setMdxCopied(false), 2500)
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-20 bg-zinc-900/95 backdrop-blur border-b border-zinc-800 px-6 py-2.5 flex items-center gap-3 flex-wrap">
        <Link href={`/${companyId}/blog`} className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-white transition-colors mr-2">
          <ArrowLeft className="w-4 h-4" />
          Blog
        </Link>

        {/* Site selector */}
        {sites.length > 0 && (
          <select
            value={selectedSiteId}
            onChange={e => setSelectedSiteId(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-violet-500/60"
          >
            <option value="">No site selected</option>
            {sites.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
        {sites.length === 0 && (
          <Link href={`/${companyId}/settings?tab=blog`} className="text-xs text-amber-400 hover:text-amber-300">
            + Add blog site in Settings
          </Link>
        )}

        {/* Publishing — quick access in top bar */}
        <div className="hidden md:flex items-center gap-2">
          <div className="flex items-center gap-0.5 bg-zinc-800 rounded-lg p-0.5">
            {STATUSES.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  const next = onStatusSelect(s, scheduledFor)
                  setStatus(next.status)
                  setScheduledFor(next.datetime)
                }}
                className={cn(
                  'px-2 py-1 rounded text-[10px] font-medium capitalize transition-colors',
                  status === s ? 'bg-violet-600 text-white' : 'text-zinc-500 hover:text-white',
                )}
              >
                {s}
              </button>
            ))}
          </div>
          <input
            type="datetime-local"
            value={scheduledFor}
            onChange={e => setScheduledFor(onDatetimeChange(e.target.value))}
            title={datetimeFieldLabel(status)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-[11px] text-zinc-300 focus:outline-none focus:ring-1 focus:ring-violet-500/60 [color-scheme:dark] w-[168px]"
          />
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2 flex-wrap">
          {saveSuccess && <span className="text-xs text-green-400 font-medium">Saved</span>}
          {saveError && <span className="text-xs text-red-400">{saveError}</span>}
          {generateError && <span className="text-xs text-red-400">{generateError}</span>}

          {/* Format selector */}
          <div className="flex items-center gap-0.5 bg-zinc-800 rounded-lg p-0.5">
            {FORMAT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setArticleFormat(opt.value)}
                disabled={generating}
                title={opt.label}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors',
                  articleFormat === opt.value
                    ? 'bg-violet-600 text-white'
                    : 'text-zinc-500 hover:text-white'
                )}
              >
                {opt.icon}
                <span className="hidden sm:inline">{opt.label}</span>
              </button>
            ))}
          </div>

          <Button variant="secondary" size="sm" onClick={() => setQualityOpen(true)} className="gap-1.5">
            <Gauge className={cn(
              'w-3.5 h-3.5',
              articleScore && (articleScore.overall >= 80 ? 'text-green-400' : articleScore.overall >= 65 ? 'text-yellow-400' : 'text-red-400'),
            )} />
            {articleScore ? `${articleScore.overall}/100` : 'Quality'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setAiEditOpen(o => !o)} disabled={generating} className="gap-1.5">
            <Wand2 className="w-3.5 h-3.5" />
            AI Edit
          </Button>
          <Button variant="secondary" size="sm" onClick={handleGenerate} disabled={generating || saving} className="gap-1.5">
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {generating ? 'Writing…' : 'AI Write'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setMdxViewOpen(true)} className="gap-1.5">
            <Code2 className="w-3.5 h-3.5" />
            MDX
          </Button>
          <Button variant="secondary" size="sm" onClick={handleCopyMdx} className="gap-1.5">
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied!' : 'Copy'}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || generating} className="gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button variant="destructive" size="icon" onClick={handleDelete} title="Delete article">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* AI Edit bar */}
      {aiEditOpen && (
        <div className="bg-violet-950/40 border-b border-violet-800/40 px-6 py-3 flex items-center gap-3">
          <Wand2 className="w-4 h-4 text-violet-400 shrink-0" />
          <input
            value={aiInstruction}
            onChange={e => setAiInstruction(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !aiEditing) void handleAiEdit() }}
            placeholder="Instruction: e.g. 'Make the intro more engaging' or 'Add a section about pricing'…"
            className="flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 outline-none"
            autoFocus
          />
          <Button size="sm" onClick={handleAiEdit} disabled={aiEditing || !aiInstruction.trim()} className="gap-1.5 shrink-0">
            {aiEditing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {aiEditing ? 'Editing…' : 'Apply'}
          </Button>
          <button onClick={() => setAiEditOpen(false)} className="text-zinc-600 hover:text-zinc-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-8">

        {/* Left: editor */}
        <div className="space-y-4 min-w-0">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Article title…"
            className="w-full bg-transparent text-3xl font-bold text-white placeholder:text-zinc-700 border-none outline-none focus:ring-0"
          />

          <div className="flex items-center justify-end gap-1">
            {(['edit', 'preview'] as const).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => setEditorViewMode(mode)}
                className={cn(
                  'px-3 py-1 rounded-lg text-xs font-medium capitalize transition-colors',
                  editorViewMode === mode
                    ? 'bg-violet-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:text-white',
                )}
              >
                {mode}
              </button>
            ))}
          </div>

          <div className="relative">
            {generating && (
              <div className="absolute inset-0 z-10 rounded-xl border border-zinc-800 bg-zinc-950/80 flex items-center gap-3 justify-center text-zinc-500">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">AI is writing your article with inline links…</span>
              </div>
            )}
            <RichTextEditor
              ref={editorRef}
              initialMarkdown={initialArticle.body}
              placeholder="Start writing, or click 'AI Write' to generate a complete article…"
              onChange={handleEditorChange}
              onInsertImageClick={openInlineImagePanel}
              readOnly={editorViewMode === 'preview'}
            />
          </div>

          {showInlineMedia && (
            <ArticleMediaPanel
              companyId={companyId}
              articleId={initialArticle.id}
              articleTitle={title}
              contentContext={[
                title,
                editorRef.current?.getSelectionContext() ?? editorBody.slice(0, 800),
                excerpt,
              ].filter(Boolean).join('\n\n')}
              mode="inline"
              suggestedPrompt={inlineSuggestedPrompt}
              brandColors={brandColors}
              onInsertInline={handleInlineImage}
            />
          )}

          <p className="text-xs text-zinc-700 text-right">{wordCount} words</p>
        </div>

        {/* Right: metadata sidebar */}
        <div className="space-y-4">

          {/* Publishing */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 space-y-4">
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium flex items-center gap-1.5">
              <CalendarClock className="w-3.5 h-3.5" />
              Publishing
            </p>

            <div className="space-y-2">
              <p className="text-[10px] text-zinc-600 uppercase tracking-widest">Status</p>
              <div className="grid grid-cols-2 gap-1.5">
                {STATUSES.map(s => (
                  <button
                    key={s}
                    onClick={() => {
                      const next = onStatusSelect(s, scheduledFor)
                      setStatus(next.status)
                      setScheduledFor(next.datetime)
                    }}
                    className={cn(
                      'py-1.5 rounded-lg text-xs font-medium capitalize transition-colors',
                      status === s ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white',
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] text-zinc-600 uppercase tracking-widest flex items-center gap-1.5">
                <CalendarClock className="w-3 h-3" />
                {datetimeFieldLabel(status)}
              </label>
              <input
                type="datetime-local"
                value={scheduledFor}
                onChange={e => setScheduledFor(onDatetimeChange(e.target.value))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500/60 [color-scheme:dark]"
              />
              {status === 'published' && (
                <p className="text-xs text-zinc-500">
                  Backdating is fine — pick when this actually went live, then save.
                </p>
              )}
              {scheduledFor && status !== 'published' && (
                <>
                  <p className="text-xs text-zinc-500">{format(new Date(scheduledFor), 'EEE, MMM d, yyyy · h:mm a')}</p>
                  <button
                    onClick={() => { setScheduledFor(''); setStatus('draft') }}
                    className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
                  >
                    Clear schedule
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Frontmatter */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden">
            <button
              onClick={() => setFrontmatterOpen(o => !o)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-zinc-800/30 transition-colors"
            >
              <span className="text-xs font-semibold text-zinc-300 uppercase tracking-widest">Frontmatter / SEO</span>
              {frontmatterOpen ? <ChevronUp className="w-4 h-4 text-zinc-600" /> : <ChevronDown className="w-4 h-4 text-zinc-600" />}
            </button>

            {frontmatterOpen && (
              <div className="px-4 pb-4 space-y-4 border-t border-zinc-800">
                {/* Slug */}
                <div className="space-y-1.5 pt-3">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium">Slug</label>
                  <input
                    value={slug}
                    onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-'))}
                    placeholder="url-friendly-slug"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-violet-500/60 font-mono"
                  />
                  {slug && (
                    <a
                      href={slugPreview}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[10px] text-zinc-600 hover:text-violet-400 transition-colors break-all"
                    >
                      <ExternalLink className="w-3 h-3 shrink-0" />
                      {slugPreview}
                    </a>
                  )}
                </div>

                {/* Meta title */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium flex items-center justify-between">
                    Meta title
                    <span className={cn('text-[10px]', metaTitle.length > 60 ? 'text-red-400' : 'text-zinc-700')}>{metaTitle.length}/60</span>
                  </label>
                  <input
                    value={metaTitle}
                    onChange={e => setMetaTitle(e.target.value)}
                    placeholder="SEO title (60 chars max)"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-violet-500/60"
                  />
                </div>

                {/* Meta description */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium flex items-center justify-between">
                    Meta description
                    <span className={cn('text-[10px]', metaDescription.length > 155 ? 'text-red-400' : 'text-zinc-700')}>{metaDescription.length}/155</span>
                  </label>
                  <textarea
                    value={metaDescription}
                    onChange={e => setMetaDescription(e.target.value)}
                    placeholder="Compelling description for search results (155 chars max)"
                    rows={3}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-300 leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-violet-500/60"
                  />
                </div>

                {/* Categories */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium">Categories</label>
                  <div className="flex flex-wrap gap-1.5 min-h-[28px] bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5">
                    {categories.map(c => (
                      <span key={c} className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-violet-600/20 text-violet-300 border border-violet-500/30">
                        {c}
                        <button onClick={() => removeItem(c, categories, setCategories)} className="hover:text-red-400"><X className="w-2.5 h-2.5" /></button>
                      </span>
                    ))}
                    <input
                      value={catInput}
                      onChange={e => setCatInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(catInput, categories, setCategories, setCatInput) }
                        else if (e.key === 'Backspace' && !catInput && categories.length > 0) setCategories(categories.slice(0, -1))
                      }}
                      onBlur={() => catInput && addTag(catInput, categories, setCategories, setCatInput)}
                      placeholder={categories.length === 0 ? 'Add category, Enter…' : '+'}
                      className="flex-1 min-w-[60px] bg-transparent text-xs text-zinc-400 placeholder:text-zinc-700 outline-none"
                    />
                  </div>
                </div>

                {/* Tags */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium flex items-center gap-1">
                    <Tag className="w-3 h-3" /> Tags
                  </label>
                  <div className="flex flex-wrap gap-1.5 min-h-[28px] bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5">
                    {tags.map(t => (
                      <span key={t} className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-400">
                        {t}
                        <button onClick={() => removeItem(t, tags, setTags)} className="hover:text-red-400"><X className="w-2.5 h-2.5" /></button>
                      </span>
                    ))}
                    <input
                      value={tagInput}
                      onChange={e => setTagInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput, tags, setTags, setTagInput) }
                        else if (e.key === 'Backspace' && !tagInput && tags.length > 0) setTags(tags.slice(0, -1))
                      }}
                      onBlur={() => tagInput && addTag(tagInput, tags, setTags, setTagInput)}
                      placeholder={tags.length === 0 ? 'Add tag, Enter…' : '+'}
                      className="flex-1 min-w-[60px] bg-transparent text-xs text-zinc-400 placeholder:text-zinc-700 outline-none"
                    />
                  </div>
                </div>

                {/* Author */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium">Author</label>
                  <input
                    value={author}
                    onChange={e => setAuthor(e.target.value)}
                    placeholder="Author name"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-violet-500/60"
                  />
                </div>

                {/* Featured Image */}
                <div className="space-y-3 border-t border-zinc-800 pt-4">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium flex items-center gap-1">
                    <ImageIcon className="w-3 h-3" />
                    Cover image
                  </label>
                  {!featuredImageUrl && (
                    <p className="text-[10px] text-zinc-600 font-mono">
                      Static path: /blog-images/{slug || 'your-slug'}.png — or generate below
                    </p>
                  )}
                  {featuredImageAlt ? (
                    <AltTextBox
                      value={featuredImageAlt}
                      label="Cover alt text"
                    />
                  ) : (
                    <textarea
                      value={featuredImageAlt}
                      onChange={e => setFeaturedImageAlt(e.target.value)}
                      placeholder="Accessibility alt text for the cover image"
                      rows={2}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-300 leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-violet-500/60"
                    />
                  )}
                  <ArticleMediaPanel
                    companyId={companyId}
                    articleId={initialArticle.id}
                    articleTitle={title}
                    contentContext={[title, excerpt, editorBody.slice(0, 2000)].filter(Boolean).join('\n\n')}
                    mode="cover"
                    suggestedPrompt={coverSuggestedPrompt || featuredImagePrompt}
                    brandColors={brandColors}
                    attachedUrl={featuredImageUrl}
                    attachedAlt={featuredImageAlt}
                    onUseCover={handleCoverImage}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Social promotion */}
          <SocialFromArticle
            articleId={initialArticle.id}
            companyId={companyId}
            defaultOpen
          />

          {/* Meta */}
          <div className="text-xs text-zinc-700 space-y-1 px-1">
            <p>Created {format(new Date(initialArticle.created_at), 'MMM d, yyyy')}</p>
            {initialArticle.published_at && <p>Published {format(new Date(initialArticle.published_at), 'MMM d, yyyy')}</p>}
            {initialArticle.ai_generated && <p className="text-violet-700">AI generated</p>}
          </div>
        </div>
      </div>
      {/* Quality check modal */}
      {qualityOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/80 backdrop-blur-sm p-4 pt-16 overflow-y-auto">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-violet-400" />
                <span className="text-sm font-semibold text-white">Quality check</span>
              </div>
              <button
                onClick={() => setQualityOpen(false)}
                className="text-zinc-500 hover:text-white transition-colors p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleScoreArticle()}
                disabled={scoring}
                className="gap-1.5 w-full"
              >
                {scoring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Gauge className="w-3.5 h-3.5" />}
                {scoring ? 'Checking…' : articleScore ? 'Re-check article' : 'Check article'}
              </Button>

              {scoreError && <p className="text-xs text-red-400">{scoreError}</p>}

              {articleScore && (
                <>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'text-lg font-semibold tabular-nums',
                      articleScore.overall >= 80 ? 'text-green-400' : articleScore.overall >= 65 ? 'text-yellow-400' : 'text-red-400'
                    )}>
                      {articleScore.overall}/100
                    </span>
                    <span className="text-xs text-zinc-600">overall</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {articleScore.categories.map(c => (
                      <div key={c.key} className="flex items-center justify-between bg-zinc-800/60 rounded-lg px-3 py-2">
                        <span className="text-xs text-zinc-500">{c.label}</span>
                        <span className={cn(
                          'text-sm font-medium tabular-nums',
                          c.score >= 80 ? 'text-green-400' : c.score >= 65 ? 'text-yellow-400' : 'text-red-400'
                        )}>
                          {c.score}
                        </span>
                      </div>
                    ))}
                  </div>

                  {articleScore.issues.length > 0 ? (
                    <ul className="space-y-2">
                      {articleScore.issues.map((issue, i) => (
                        <li key={i} className="flex items-start gap-2 bg-zinc-800/40 rounded-lg px-3 py-2">
                          <div className="flex-1 min-w-0">
                            <span className="text-[10px] text-zinc-600 uppercase font-medium">{issue.category}</span>
                            <p className="text-xs text-zinc-400 leading-relaxed">{issue.note}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleFixIssue(issue, i)}
                            disabled={fixingIssueIndex !== null || scoring}
                            className="shrink-0 flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg bg-violet-600/20 text-violet-300 hover:bg-violet-600/30 disabled:opacity-40 transition-colors"
                          >
                            {fixingIssueIndex === i ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                            Fix
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-zinc-600">No issues flagged.</p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MDX View Modal */}
      {mdxViewOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/80 backdrop-blur-sm p-4 pt-16 overflow-y-auto">
          <div className="w-full max-w-3xl bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-violet-400" />
                <span className="text-sm font-semibold text-white">MDX Export</span>
                <span className="text-xs text-zinc-500">Frontmatter + article body, ready to paste into your codebase</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyFullMdx}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors"
                >
                  {mdxCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {mdxCopied ? 'Copied!' : 'Copy all'}
                </button>
                <button
                  onClick={() => setMdxViewOpen(false)}
                  className="text-zinc-500 hover:text-white transition-colors p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {/* Content */}
            <pre className="px-5 py-4 text-xs text-zinc-300 font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap break-words max-h-[70vh] overflow-y-auto">
              {buildMdxContent()}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
