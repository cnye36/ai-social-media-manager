'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Upload, Building2 } from 'lucide-react'
import type { Company } from '@/types/database'
import Image from 'next/image'

interface CompanySettingsFormProps {
  company: Company
}

export function CompanySettingsForm({ company }: CompanySettingsFormProps) {
  const [name, setName] = useState(company.name)
  const [websiteUrl, setWebsiteUrl] = useState(company.website_url ?? '')
  const [logoUrl, setLogoUrl] = useState(company.logo_url)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`/api/companies/${company.id}/logo`, { method: 'POST', body: form })
    setUploading(false)
    if (res.ok) {
      const { url } = await res.json()
      // Bust the CDN cache by appending a timestamp
      setLogoUrl(`${url}?t=${Date.now()}`)
    }
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    setSaveError(null)
    const res = await fetch(`/api/companies/${company.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, website_url: websiteUrl }),
    })
    setSaving(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setSaveError(typeof body.error === 'string' ? body.error : 'Failed to save')
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-8">
      {/* Logo */}
      <div className="space-y-3">
        <Label>Company logo</Label>
        <div className="flex items-center gap-5">
          <div className="w-20 h-20 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center overflow-hidden flex-shrink-0">
            {logoUrl ? (
              <Image src={logoUrl} alt="Company logo" width={80} height={80} className="object-contain w-full h-full" unoptimized />
            ) : (
              <Building2 className="w-8 h-8 text-zinc-600" />
            )}
          </div>
          <div className="space-y-1.5">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoChange}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="w-4 h-4 mr-2" />
              {uploading ? 'Uploading...' : 'Upload logo'}
            </Button>
            <p className="text-xs text-zinc-500">PNG, JPG, SVG — recommended 400×400px</p>
          </div>
        </div>
      </div>

      {/* Name */}
      <div className="space-y-1.5">
        <Label htmlFor="company-name">Company name</Label>
        <Input
          id="company-name"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Acme Corp"
        />
      </div>

      {/* Website */}
      <div className="space-y-1.5">
        <Label htmlFor="website">Website URL</Label>
        <Input
          id="website"
          value={websiteUrl}
          onChange={e => setWebsiteUrl(e.target.value)}
          placeholder="https://acme.com"
          type="url"
        />
      </div>

      {saveError && <p className="text-sm text-red-400">{saveError}</p>}
      <Button onClick={handleSave} disabled={saving || !name.trim()}>
        {saving ? 'Saving...' : saved ? 'Saved!' : 'Save changes'}
      </Button>
    </div>
  )
}
