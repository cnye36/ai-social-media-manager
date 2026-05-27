'use client'

import { useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp, ExternalLink, Loader2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { BlogSite } from '@/types/database'
import { DEFAULT_FRONTMATTER_TEMPLATE } from '@/lib/blog/frontmatter'

interface BlogSitesSettingsProps {
  companyId: string
  initialSites: BlogSite[]
}

export function BlogSitesSettings({ companyId, initialSites }: BlogSitesSettingsProps) {
  const [sites, setSites] = useState<BlogSite[]>(initialSites)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [newAuthor, setNewAuthor] = useState('')
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editState, setEditState] = useState<Record<string, { template: string; author: string; baseUrl: string; saving: boolean; saved: boolean }>>({})

  function getEdit(site: BlogSite) {
    return editState[site.id] ?? { template: site.frontmatter_template, author: site.default_author ?? '', baseUrl: site.base_url, saving: false, saved: false }
  }

  function setEdit(id: string, patch: Partial<{ template: string; author: string; baseUrl: string; saving: boolean; saved: boolean }>) {
    setEditState(prev => ({ ...prev, [id]: { ...getEdit({ id } as BlogSite), ...patch } }))
  }

  async function handleCreate() {
    if (!newName.trim() || !newUrl.trim()) return
    setCreating(true)
    const res = await fetch('/api/blog/sites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_id: companyId, name: newName.trim(), base_url: newUrl.trim().replace(/\/$/, '') + '/', default_author: newAuthor.trim() || null }),
    })
    if (res.ok) {
      const site: BlogSite = await res.json()
      setSites(prev => [...prev, site])
      setNewName(''); setNewUrl(''); setNewAuthor('')
      setAdding(false)
    }
    setCreating(false)
  }

  async function handleSave(siteId: string) {
    const edit = getEdit(sites.find(s => s.id === siteId)!)
    setEdit(siteId, { saving: true, saved: false })
    const res = await fetch(`/api/blog/sites/${siteId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_url: edit.baseUrl.replace(/\/$/, '') + '/', default_author: edit.author || null, frontmatter_template: edit.template }),
    })
    if (res.ok) {
      const updated: BlogSite = await res.json()
      setSites(prev => prev.map(s => s.id === siteId ? updated : s))
      setEdit(siteId, { saving: false, saved: true })
      setTimeout(() => setEdit(siteId, { saved: false }), 2000)
    } else {
      setEdit(siteId, { saving: false })
    }
  }

  async function handleImportLegacyCatalog() {
    if (!confirm('Import ~40 published posts from your website catalog into the calendar and link index? Existing slugs will be updated.')) return
    setImporting(true)
    setImportResult(null)
    try {
      const res = await fetch('/api/blog/import-legacy-catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      })
      const data = await res.json() as {
        error?: string
        articlesCreated?: number
        articlesUpdated?: number
        linkIndexUpserts?: number
        catalogEntries?: number
      }
      if (!res.ok) throw new Error(data.error ?? 'Import failed')
      setImportResult(
        `Imported ${data.catalogEntries ?? 0} posts (${data.articlesCreated ?? 0} new, ${data.articlesUpdated ?? 0} updated). Link index: ${data.linkIndexUpserts ?? 0}.`,
      )
    } catch (e) {
      setImportResult((e as Error).message)
    } finally {
      setImporting(false)
    }
  }

  async function handleDelete(siteId: string) {
    if (!confirm('Remove this blog site? Existing articles linked to it will be unlinked.')) return
    await fetch(`/api/blog/sites/${siteId}`, { method: 'DELETE' })
    setSites(prev => prev.filter(s => s.id !== siteId))
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-700/80 bg-zinc-900/40 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-300">Website publish history</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            Load past blog posts (title, date, summary) into the calendar and internal link index for the blog agent.
          </p>
          {importResult && <p className="text-xs text-emerald-400/90 mt-2">{importResult}</p>}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={importing}
          onClick={handleImportLegacyCatalog}
          className="shrink-0 gap-1.5"
        >
          {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          {importing ? 'Importing…' : 'Import catalog'}
        </Button>
      </div>

      {sites.length === 0 && !adding && (
        <div className="text-center py-8 text-zinc-500 text-sm">
          <p>No blog sites configured yet.</p>
          <p className="text-xs mt-1 text-zinc-600">Add your sites to enable slug generation, frontmatter templates, and internal linking.</p>
        </div>
      )}

      {sites.map(site => {
        const edit = getEdit(site)
        const isOpen = expandedId === site.id
        return (
          <div key={site.id} className="rounded-xl border border-zinc-700 bg-zinc-800/40 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">{site.name}</p>
                <a href={site.base_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-zinc-500 hover:text-violet-400 transition-colors">
                  <ExternalLink className="w-3 h-3" />
                  {site.base_url}
                </a>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setExpandedId(isOpen ? null : site.id)}
                  className="text-zinc-500 hover:text-white transition-colors p-1"
                >
                  {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                <button onClick={() => handleDelete(site.id)} className="text-zinc-600 hover:text-red-400 transition-colors p-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {isOpen && (
              <div className="border-t border-zinc-700 px-4 py-4 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium">Base URL</label>
                  <input
                    value={edit.baseUrl}
                    onChange={e => setEdit(site.id, { baseUrl: e.target.value })}
                    placeholder="https://example.com/blog/"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-violet-500/60"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium">Default author</label>
                  <input
                    value={edit.author}
                    onChange={e => setEdit(site.id, { author: e.target.value })}
                    placeholder="Author name"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-violet-500/60"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium">
                    Frontmatter template
                    <span className="ml-2 normal-case font-normal text-zinc-600">Use {'{{metaTitle}}'}, {'{{metaDescription}}'}, {'{{date}}'}, {'{{author}}'}, {'{{categoriesYaml}}'}, {'{{tagsSection}}'}, {'{{featuredImageSrc}}'}, {'{{featuredImageAlt}}'}, {'{{featuredImageWidth}}'}, {'{{featuredImageHeight}}'}</span>
                  </label>
                  <textarea
                    value={edit.template}
                    onChange={e => setEdit(site.id, { template: e.target.value })}
                    rows={12}
                    spellCheck={false}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-300 font-mono leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-violet-500/60"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => handleSave(site.id)} disabled={edit.saving} className="gap-1.5">
                    {edit.saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : edit.saved ? <Check className="w-3.5 h-3.5" /> : null}
                    {edit.saving ? 'Saving…' : edit.saved ? 'Saved!' : 'Save changes'}
                  </Button>
                  <button
                    onClick={() => setEdit(site.id, { template: DEFAULT_FRONTMATTER_TEMPLATE })}
                    className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
                  >
                    Reset to default
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {adding ? (
        <div className="rounded-xl border border-zinc-700 bg-zinc-800/40 p-4 space-y-3">
          <p className="text-sm font-medium text-white">New blog site</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Site name</label>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="My Blog"
                autoFocus
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-violet-500/60"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Default author</label>
              <input
                value={newAuthor}
                onChange={e => setNewAuthor(e.target.value)}
                placeholder="Your name"
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-violet-500/60"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Blog base URL</label>
            <input
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              placeholder="https://ai-automatedhq.com/blog/"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-violet-500/60"
            />
            <p className="text-[10px] text-zinc-600">
              Use your blog root including <code className="text-zinc-500">/blog</code> (typo <code className="text-zinc-500">/bog</code> is auto-corrected).
              Preview: {newUrl ? `${newUrl.replace(/\/$/, '')}/your-slug` : 'https://example.com/blog/your-slug'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate} disabled={creating || !newName.trim() || !newUrl.trim()} className="gap-1.5">
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              {creating ? 'Creating…' : 'Add site'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => { setAdding(false); setNewName(''); setNewUrl(''); setNewAuthor('') }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className={cn(
            'w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-zinc-800',
            'text-sm text-zinc-600 hover:text-zinc-300 hover:border-zinc-600 transition-colors'
          )}
        >
          <Plus className="w-4 h-4" />
          Add blog site
        </button>
      )}
    </div>
  )
}
