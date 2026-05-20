import { createAdminClient } from '@/lib/supabase/admin'

export type InfographicLayout = 'stats' | 'steps' | 'list' | 'comparison'

export interface InfographicSpec {
  layout: InfographicLayout
  title: string
  subtitle?: string
  items: InfographicItem[]
  primaryColor?: string
  accentColor?: string
  companyName?: string
}

export interface InfographicItem {
  label: string
  value?: string        // for stats
  description?: string  // for steps / list
  left?: string         // for comparison (left column)
  right?: string        // for comparison (right column)
}

export interface RenderedInfographic {
  svg: string
  url: string
  storagePath: string
}

// ── SVG templates ─────────────────────────────────────────────────────────────

function wrapSvg(content: string, height: number, primary: string, accent: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height}" viewBox="0 0 1200 ${height}" font-family="system-ui,-apple-system,sans-serif">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0f0f11"/>
      <stop offset="100%" style="stop-color:#18181b"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:${primary}"/>
      <stop offset="100%" style="stop-color:${accent}"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="${height}" fill="url(#bg)" rx="24"/>
  <rect x="0" y="0" width="6" height="${height}" fill="url(#accent)" rx="3"/>
  ${content}
</svg>`
}

function renderStats(spec: InfographicSpec, primary: string, accent: string): string {
  const { title, subtitle, items, companyName } = spec
  const cols = Math.min(items.length, 4)
  const colW = 1100 / cols
  const height = 480

  const header = `
  <text x="60" y="80" font-size="42" font-weight="700" fill="white">${escSvg(title)}</text>
  ${subtitle ? `<text x="60" y="118" font-size="22" fill="#a1a1aa">${escSvg(subtitle)}</text>` : ''}
  <rect x="60" y="148" width="80" height="4" fill="url(#accent)" rx="2"/>`

  const statCards = items.slice(0, 4).map((item, i) => {
    const x = 60 + i * colW
    return `
    <rect x="${x}" y="180" width="${colW - 24}" height="200" fill="#27272a" rx="16"/>
    <text x="${x + (colW - 24) / 2}" y="270" font-size="52" font-weight="800" fill="${primary}" text-anchor="middle">${escSvg(item.value ?? '')}</text>
    <text x="${x + (colW - 24) / 2}" y="310" font-size="18" fill="#a1a1aa" text-anchor="middle">${escSvg(item.label)}</text>
    ${item.description ? `<text x="${x + (colW - 24) / 2}" y="345" font-size="14" fill="#71717a" text-anchor="middle">${escSvg(item.description)}</text>` : ''}`
  }).join('')

  const footer = companyName
    ? `<text x="1140" y="${height - 24}" font-size="16" fill="#52525b" text-anchor="end">${escSvg(companyName)}</text>`
    : ''

  return wrapSvg(header + statCards + footer, height, primary, accent)
}

function renderSteps(spec: InfographicSpec, primary: string, accent: string): string {
  const { title, subtitle, items, companyName } = spec
  const height = 160 + items.length * 110
  const header = `
  <text x="60" y="80" font-size="42" font-weight="700" fill="white">${escSvg(title)}</text>
  ${subtitle ? `<text x="60" y="118" font-size="22" fill="#a1a1aa">${escSvg(subtitle)}</text>` : ''}
  <rect x="60" y="140" width="80" height="4" fill="url(#accent)" rx="2"/>`

  const steps = items.map((item, i) => {
    const y = 168 + i * 110
    const isLast = i === items.length - 1
    return `
    <circle cx="108" cy="${y + 36}" r="28" fill="${primary}" opacity="0.15"/>
    <circle cx="108" cy="${y + 36}" r="22" fill="${primary}"/>
    <text x="108" y="${y + 44}" font-size="22" font-weight="700" fill="white" text-anchor="middle">${i + 1}</text>
    ${!isLast ? `<line x1="108" y1="${y + 60}" x2="108" y2="${y + 110}" stroke="${primary}" stroke-width="2" stroke-dasharray="4 4" opacity="0.4"/>` : ''}
    <text x="164" y="${y + 30}" font-size="22" font-weight="600" fill="white">${escSvg(item.label)}</text>
    ${item.description ? `<text x="164" y="${y + 58}" font-size="17" fill="#a1a1aa">${escSvg(item.description.slice(0, 90))}</text>` : ''}`
  }).join('')

  const footer = companyName
    ? `<text x="1140" y="${height - 24}" font-size="16" fill="#52525b" text-anchor="end">${escSvg(companyName)}</text>`
    : ''

  return wrapSvg(header + steps + footer, height, primary, accent)
}

function renderList(spec: InfographicSpec, primary: string, accent: string): string {
  const { title, subtitle, items, companyName } = spec
  const height = 200 + Math.ceil(items.length / 2) * 100

  const header = `
  <text x="60" y="80" font-size="42" font-weight="700" fill="white">${escSvg(title)}</text>
  ${subtitle ? `<text x="60" y="118" font-size="22" fill="#a1a1aa">${escSvg(subtitle)}</text>` : ''}
  <rect x="60" y="140" width="80" height="4" fill="url(#accent)" rx="2"/>`

  const listItems = items.map((item, i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    const x = 60 + col * 580
    const y = 168 + row * 100
    return `
    <rect x="${x}" y="${y}" width="540" height="80" fill="#27272a" rx="12"/>
    <rect x="${x}" y="${y}" width="5" height="80" fill="${primary}" rx="2"/>
    <text x="${x + 24}" y="${y + 32}" font-size="19" font-weight="600" fill="white">${escSvg(item.label)}</text>
    ${item.description ? `<text x="${x + 24}" y="${y + 58}" font-size="15" fill="#a1a1aa">${escSvg(item.description.slice(0, 60))}</text>` : ''}`
  }).join('')

  const footer = companyName
    ? `<text x="1140" y="${height - 24}" font-size="16" fill="#52525b" text-anchor="end">${escSvg(companyName)}</text>`
    : ''

  return wrapSvg(header + listItems + footer, height, primary, accent)
}

function renderComparison(spec: InfographicSpec, primary: string, accent: string): string {
  const { title, subtitle, items, companyName } = spec
  const height = 200 + items.length * 90

  const header = `
  <text x="60" y="80" font-size="42" font-weight="700" fill="white">${escSvg(title)}</text>
  ${subtitle ? `<text x="60" y="118" font-size="22" fill="#a1a1aa">${escSvg(subtitle)}</text>` : ''}
  <rect x="60" y="140" width="80" height="4" fill="url(#accent)" rx="2"/>
  <text x="390" y="170" font-size="18" font-weight="600" fill="${primary}" text-anchor="middle">Before / Without</text>
  <text x="810" y="170" font-size="18" font-weight="600" fill="${accent}" text-anchor="middle">After / With</text>
  <line x1="600" y1="155" x2="600" y2="${height - 40}" stroke="#3f3f46" stroke-width="1"/>`

  const rows = items.map((item, i) => {
    const y = 188 + i * 90
    return `
    <rect x="60" y="${y}" width="500" height="72" fill="#27272a" rx="10"/>
    <text x="310" y="${y + 28}" font-size="17" font-weight="600" fill="white" text-anchor="middle">${escSvg(item.label)}</text>
    <text x="310" y="${y + 52}" font-size="15" fill="#a1a1aa" text-anchor="middle">${escSvg((item.left ?? item.value ?? '').slice(0, 55))}</text>
    <rect x="640" y="${y}" width="500" height="72" fill="${primary}1a" rx="10"/>
    <rect x="640" y="${y}" width="4" height="72" fill="${accent}" rx="2"/>
    <text x="890" y="${y + 28}" font-size="17" font-weight="600" fill="white" text-anchor="middle">${escSvg(item.label)}</text>
    <text x="890" y="${y + 52}" font-size="15" fill="#d4d4d8" text-anchor="middle">${escSvg((item.right ?? '').slice(0, 55))}</text>`
  }).join('')

  const footer = companyName
    ? `<text x="1140" y="${height - 24}" font-size="16" fill="#52525b" text-anchor="end">${escSvg(companyName)}</text>`
    : ''

  return wrapSvg(header + rows + footer, height, primary, accent)
}

function escSvg(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function renderInfographicSvg(spec: InfographicSpec): string {
  const primary = spec.primaryColor ?? '#7c3aed'
  const accent = spec.accentColor ?? '#a78bfa'

  switch (spec.layout) {
    case 'stats':      return renderStats(spec, primary, accent)
    case 'steps':      return renderSteps(spec, primary, accent)
    case 'comparison': return renderComparison(spec, primary, accent)
    case 'list':
    default:           return renderList(spec, primary, accent)
  }
}

export async function renderAndStoreInfographic(
  spec: InfographicSpec,
  companyId: string,
  postId?: string
): Promise<RenderedInfographic> {
  const svg = renderInfographicSvg(spec)
  const filename = `${companyId}/infographic-${Date.now()}.svg`

  const supabase = createAdminClient()
  const { error } = await supabase.storage
    .from('media')
    .upload(filename, Buffer.from(svg), { contentType: 'image/svg+xml', upsert: false })

  if (error) throw new Error(`Storage upload failed: ${error.message}`)

  const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(filename)

  // Fire-and-forget — never block infographic delivery on a library write
  void (async () => {
    const { error } = await supabase.from('media_library').insert({
      company_id: companyId,
      storage_path: filename,
      url: publicUrl,
      prompt: spec.title.slice(0, 500),
      type: 'infographic',
      svg,
      post_id: postId ?? null,
    })
    if (error) console.warn('[media-library] infographic save failed:', error.message, error.code)
  })()

  return { svg, url: publicUrl, storagePath: filename }
}
