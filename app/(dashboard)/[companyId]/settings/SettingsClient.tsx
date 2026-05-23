'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Building2, Palette, BookOpen, Link2, Globe } from 'lucide-react'
import { CompanySettingsForm } from '@/components/settings/CompanySettingsForm'
import { BrandSettingsForm } from '@/components/settings/BrandSettingsForm'
import { BufferConnect } from '@/components/settings/BufferConnect'
import { RedditConnect } from '@/components/settings/RedditConnect'
import { CanvaConnect } from '@/components/settings/CanvaConnect'
import { ScrapeForm } from '@/components/knowledge/ScrapeForm'
import { ManualEntryForm } from '@/components/knowledge/ManualEntryForm'
import { KnowledgeList } from '@/components/knowledge/KnowledgeList'
import { BlogSitesSettings } from '@/components/settings/BlogSitesSettings'
import type { Company, BrandProfile, KnowledgeChunk, BlogSite } from '@/types/database'

type Tab = 'company' | 'brand' | 'knowledge' | 'connections' | 'blog'

const tabs: { id: Tab; label: string; icon: typeof Building2 }[] = [
  { id: 'company', label: 'Company', icon: Building2 },
  { id: 'brand', label: 'Brand & Voice', icon: Palette },
  { id: 'knowledge', label: 'Knowledge Base', icon: BookOpen },
  { id: 'connections', label: 'Connections', icon: Link2 },
  { id: 'blog', label: 'Blog Sites', icon: Globe },
]

interface SettingsClientProps {
  company: Company
  brandProfile: BrandProfile | null
  knowledgeChunks: KnowledgeChunk[]
  knowledgeTotal: number
  blogSites: BlogSite[]
  defaultTab?: Tab
}

export function SettingsClient({
  company,
  brandProfile,
  knowledgeChunks,
  knowledgeTotal,
  blogSites,
  defaultTab = 'company',
}: SettingsClientProps) {
  const validTabs: Tab[] = ['company', 'brand', 'knowledge', 'connections', 'blog']
  const [activeTab, setActiveTab] = useState<Tab>(
    validTabs.includes(defaultTab as Tab) ? (defaultTab as Tab) : 'company'
  )

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-zinc-800 mb-8">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === id
                ? 'border-violet-500 text-violet-300'
                : 'border-transparent text-zinc-400 hover:text-white'
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      {activeTab === 'company' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <CompanySettingsForm company={company} />
        </div>
      )}

      {activeTab === 'brand' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <BrandSettingsForm companyId={company.id} initialData={brandProfile} />
        </div>
      )}

      {activeTab === 'connections' && (
        <div className="space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <div className="mb-5">
              <h2 className="font-semibold text-white">Design tools</h2>
              <p className="text-zinc-400 text-sm mt-0.5">
                Connect design tools to edit and enhance generated images.
              </p>
            </div>
            <CanvaConnect companyId={company.id} />
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <div className="mb-5">
              <h2 className="font-semibold text-white">Publishing integrations</h2>
              <p className="text-zinc-400 text-sm mt-0.5">
                Connect third-party publishing tools. When active, scheduled posts are sent through the connected service.
              </p>
            </div>
            <BufferConnect companyId={company.id} />
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <div className="mb-5">
              <h2 className="font-semibold text-white">Reddit</h2>
              <p className="text-zinc-400 text-sm mt-0.5">
                Connect your Reddit account to monitor subreddits with live stats and post reply drafts.
              </p>
            </div>
            <RedditConnect companyId={company.id} />
          </div>
        </div>
      )}

      {activeTab === 'blog' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="mb-5">
            <h2 className="font-semibold text-white">Blog Sites</h2>
            <p className="text-zinc-400 text-sm mt-0.5">
              Configure your blog endpoints. Articles will use these for slug URLs, frontmatter templates, and the internal link index.
            </p>
          </div>
          <BlogSitesSettings companyId={company.id} initialSites={blogSites} />
        </div>
      )}

      {activeTab === 'knowledge' && (
        <div className="space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <div className="mb-5">
              <h2 className="font-semibold text-white">Scrape website</h2>
              <p className="text-zinc-400 text-sm mt-0.5">Automatically extract content from your website pages</p>
            </div>
            <ScrapeForm companyId={company.id} />
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <div className="mb-5">
              <h2 className="font-semibold text-white">Add manually</h2>
              <p className="text-zinc-400 text-sm mt-0.5">
                Paste product descriptions, bios, FAQs, talking points, or anything else
              </p>
            </div>
            <ManualEntryForm companyId={company.id} />
          </div>

          <div>
            <h2 className="font-semibold text-white mb-4">Indexed knowledge</h2>
            <KnowledgeList
              initialChunks={knowledgeChunks}
              initialTotal={knowledgeTotal}
              companyId={company.id}
            />
          </div>
        </div>
      )}
    </div>
  )
}
