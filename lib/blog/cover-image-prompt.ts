/** Cover image prompt builder — picks a random layout archetype each time. */

const ACCENT_GRADIENTS: Record<string, string> = {
  cyan:    'cyan-to-sky-blue (#06b6d4 → #0ea5e9)',
  purple:  'purple-to-violet (#a855f7 → #7c3aed)',
  amber:   'amber-to-orange (#f59e0b → #f97316)',
  emerald: 'emerald-to-teal (#10b981 → #14b8a6)',
  blue:    'blue-to-indigo (#3b82f6 → #6366f1)',
  rose:    'rose-to-pink (#f43f5e → #ec4899)',
}

// ── Layout archetypes ──────────────────────────────────────────────────────
//
//  Each archetype is a self-contained design brief. The image model receives
//  exactly one, selected at random, so consecutive articles look different.
//
//  THEME RULE: every archetype must look good when displayed on both a
//  light blog page AND a dark blog page. Archetypes with a light/white bg
//  instruct the model to add a visible border + shadow so the image doesn't
//  bleed into a light-colored page background.
// ──────────────────────────────────────────────────────────────────────────

type Archetype = {
  name: string
  brief: (p: ArchetypeParams) => string
}

interface ArchetypeParams {
  hook: string
  rightVisual: string
  benefits: string[]
  topicBadge: string
  accent: string
  gradient: string
}

const ARCHETYPES: Archetype[] = [

  // 1. Classic split — headline left, visual right, benefit strip bottom
  {
    name: 'classic-split',
    brief: ({ hook, rightVisual, benefits, topicBadge, accent, gradient }) => `
LAYOUT: Classic professional split — text left, visual right.

BACKGROUND: Deep navy gradient (#0a0e1f → #111827). Subtle dot-grid at 10% opacity.

LEFT ZONE (48% width, vertically centered):
${topicBadge ? `- Small rounded pill badge at top: "${topicBadge.toUpperCase()}" — all-caps 11px, semi-transparent bg, thin ${accent} border\n` : ''}- Large bold headline: "${hook}" — Inter Black, 64px, white with 1–2 keywords in ${gradient} gradient, 4 words max per line
- 1-line supporting subtitle in zinc-400, 14px

RIGHT ZONE (46% width): ${rightVisual}
- Soft ${accent} glow bloom behind the element at 35% opacity
- Thin 1px ${accent} border on card/box edges

BOTTOM STRIP (full width, 18% height): Frosted glass bar — ${benefits.length > 0 ? benefits.map(b => `icon + "${b}"`).join(' | ') : '3–4 icon + 2-word benefit badges, evenly spaced'}
`.trim(),
  },

  // 2. Visual left — big diagram/mockup left, headline stacked right
  {
    name: 'visual-left',
    brief: ({ hook, rightVisual, benefits, topicBadge, accent, gradient }) => `
LAYOUT: Visual-left composition — primary visual occupies left 50%, text stacks right.

BACKGROUND: Dark teal-to-charcoal gradient (#0d1f2d → #1a1a2e). Subtle hexagonal mesh at 8% opacity.

LEFT ZONE (50% width, slight overlap into center): ${rightVisual}
- Soft ${accent} glow bloom at 40% opacity behind the element

RIGHT ZONE (46% width, vertically centered):
${topicBadge ? `- Small pill badge: "${topicBadge.toUpperCase()}" — 11px all-caps, thin ${accent} border\n` : ''}- Headline: "${hook}" — 60px bold, white + ${gradient} keyword gradient
- Below headline: vertical stack of ${benefits.length > 0 ? benefits.slice(0, 3).map(b => `• "${b}"`).join('  ') : '3 short bullet benefits'} each with a small ${accent} circle icon — no bottom strip
`.trim(),
  },

  // 3. Centered hero — large centered headline, visual floats behind, circles scattered
  {
    name: 'centered-hero',
    brief: ({ hook, rightVisual, benefits, topicBadge, accent, gradient }) => `
LAYOUT: Centered hero — headline dominates center, benefit circles scattered.

BACKGROUND: Rich dark charcoal (#111 → #1c1c2e) with subtle radial glow in ${accent} at 20% opacity center.

CENTER (full width, vertically centered):
${topicBadge ? `- Topic badge at very top center: "${topicBadge.toUpperCase()}" pill\n` : ''}- Giant headline: "${hook}" — 72px Inter Black, centered, white with key words in ${gradient}
- Short descriptor line beneath: 14px zinc-300

FLOATING BENEFIT CIRCLES (scattered below and around the headline, not touching it):
- ${benefits.length > 0 ? benefits.map(b => `Round badge: "${b}"`).join(', ') : '3–4 round badges with icons + 2-word labels'}
- Each circle: 80–90px diameter, frosted glass bg, ${accent} icon, white text, positioned at varied heights
- Place 2 left of center, 2 right of center at slightly different Y positions

BACKGROUND ELEMENT: ${rightVisual} — rendered softly at 15% opacity as a watermark-style texture behind the headline, not competing with text.
`.trim(),
  },

  // 4. Light editorial — clean white/cream bg, bold colored headline, sketch diagram
  {
    name: 'light-editorial',
    brief: ({ hook, rightVisual, benefits, topicBadge, accent, gradient }) => `
LAYOUT: Light editorial style — clean white background, editorial magazine feel.

BACKGROUND: Off-white (#f8f9fa) or very light gray (#f1f5f9). Subtle light texture. 2px rounded border and soft drop shadow on the full image edge so it reads on dark blog themes.

LEFT ZONE (50% width):
${topicBadge ? `- Small colored pill: "${topicBadge.toUpperCase()}" — filled ${accent} bg, white text, top-left\n` : ''}- Headline: "${hook}" — 64px bold, near-black (#0f172a) with 1–2 words in ${gradient} gradient
- Thin colored rule (4px, ${accent}) beneath headline as visual separator
- Benefit list below: ${benefits.length > 0 ? benefits.map(b => `small icon + "${b}"`).join(', ') : '3 short benefits with small colored icons'} — dark text, spaced vertically

RIGHT ZONE (44% width): ${rightVisual}
- Light-mode version: white cards with colored borders (${accent}), no dark backgrounds
- Minimal shadow for depth

OVERALL: Clean, professional, trust-inspiring — like a top-tier marketing blog or Hubspot-style content.
`.trim(),
  },

  // 5. Top badge row — badges along the top, big visual center, headline bottom-left
  {
    name: 'top-badges',
    brief: ({ hook, rightVisual, benefits, topicBadge, accent, gradient }) => `
LAYOUT: Top-loaded design — badge row at top, large visual dominates center, headline anchors bottom-left.

BACKGROUND: Deep navy-to-purple gradient (#0a0e1f → #1e1b4b). Faint star-field/particle effect at 6% opacity.

TOP ROW (full width, 15% height): ${benefits.length > 0 ? `Row of ${benefits.length} pill badges, evenly spaced: ${benefits.map(b => `"${b}"`).join(', ')} — each with small ${accent} icon, frosted glass bg` : 'Row of 3–4 frosted-glass pill badges with topic-relevant icons and 2-word labels'}

CENTER ZONE (full width, 55% height): ${rightVisual}
- Centered, prominent, vivid — this is the star of the image
- ${accent} glow bloom behind at 50% opacity

BOTTOM-LEFT ZONE (50% width, 30% height, overlapping center slightly):
${topicBadge ? `- Tiny category label: "${topicBadge.toUpperCase()}" in ${accent} color, 10px\n` : ''}- Headline: "${hook}" — 56px bold white with ${gradient} keywords, left-aligned
`.trim(),
  },

  // 6. Full-bleed split with overlap — visual bleeds edge to edge, text overlay in frosted panel
  {
    name: 'frosted-overlay',
    brief: ({ hook, rightVisual, benefits, topicBadge, accent, gradient }) => `
LAYOUT: Full-bleed visual with frosted glass text panel.

BACKGROUND: ${rightVisual} fills the entire canvas edge to edge — rich, detailed, slightly darkened (60% opacity overlay on the visual to ensure text readability).

FROSTED TEXT PANEL (left 52% width, vertically centered, slight rounded corners):
- Background: frosted glass — rgba(10,14,31,0.78) with backdrop blur
- Thin top border in ${accent} at full panel width
${topicBadge ? `- Tiny pill: "${topicBadge.toUpperCase()}" above headline\n` : ''}- Headline: "${hook}" — 62px Inter Black, white with ${gradient} keyword accents
- Subtitle line: 14px zinc-300
- Bottom of panel: ${benefits.length > 0 ? benefits.slice(0, 3).map(b => `icon + "${b}"`).join(' | ') : '3 icon + 2-word benefit badges'} in a mini row

OVERALL: Cinematic depth — the visual background gives richness, the frosted panel ensures text is crisp.
`.trim(),
  },

  // 7. Scattered icons — minimal text, 5-6 floating icon cards spread across image
  {
    name: 'scattered-icons',
    brief: ({ hook, rightVisual, benefits, topicBadge, accent, gradient }) => `
LAYOUT: Dynamic scattered-card design — headline top-left, feature cards float across the canvas.

BACKGROUND: Very dark navy-charcoal (#0c0c1d) with subtle diagonal line texture at 6% opacity. ${accent} radial glow at far right edge, 25% opacity.

TOP-LEFT ZONE:
${topicBadge ? `- Category badge: "${topicBadge.toUpperCase()}" — small pill\n` : ''}- Headline: "${hook}" — 60px bold, white + ${gradient} gradient keywords
- Short 1-line subtitle beneath in zinc-400

FLOATING FEATURE CARDS (5–7 cards scattered across the remaining 70% of canvas):
- Cards vary in size: some 140×80px, some 100×60px, positioned at different angles (±8° max) and heights
- Each card: frosted glass bg, thin 1px ${accent} border, small icon top-left, 2–3 word label in white 12px
- Cards represent: ${benefits.length > 0 ? benefits.concat(['key feature', 'stat metric']).slice(0, 6).map(b => `"${b}"`).join(', ') : 'key topic features and metrics from the article'}
- Leave comfortable spacing between cards — no overlapping text
- The central/right area also includes: ${rightVisual} rendered as one of the larger floating cards
`.trim(),
  },

  // 8. Minimalist typography — near-zero decoration, massive type, one accent element
  {
    name: 'minimalist-type',
    brief: ({ hook, rightVisual, benefits, topicBadge, accent, gradient }) => `
LAYOUT: Bold typographic minimalism — type IS the design.

BACKGROUND: Solid very dark charcoal (#141414) OR extremely light warm white (#fafaf9 with 1px border + shadow for dark-theme compatibility). Choose whichever creates better contrast with the accent color.

DESIGN:
- ONE thick ${accent}-colored horizontal rule, 6px, at 30% from top, full width
${topicBadge ? `- Small "${topicBadge.toUpperCase()}" label just above the rule — 10px all-caps ${accent}-colored\n` : ''}- Headline: "${hook}" — massive 80px Inter Black (or equivalent), above/crossing the rule, high contrast color (white on dark bg, #0f172a on light bg), 1–2 words in ${gradient}
- Below rule: short 14px supporting line in subdued color

RIGHT ACCENT: One single graphic element — ${rightVisual} rendered cleanly in the right 35%, minimally styled, acting as punctuation not decoration. Keep it simple: line-art style or icon cluster.

BENEFIT ROW: Bottom of image — ${benefits.length > 0 ? benefits.map(b => `"${b}"`).join(' · ') : '3–4 short benefits'} separated by thin dividers or dots, small text, no icons needed.

OVERALL: Feels like a premium editorial from Fast Company or Wired — confident, spare, typography-first.
`.trim(),
  },
]

// ── Seeded random using article content as seed ────────────────────────────

function simpleHash(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function pickArchetype(seed: string): Archetype {
  const idx = simpleHash(seed) % ARCHETYPES.length
  return ARCHETYPES[idx]
}

// ── Public interface ───────────────────────────────────────────────────────

export interface CoverImageVisualParams {
  hook: string
  rightVisual?: string
  benefits?: string[]
  topicBadge?: string
  accentColor?: string
  /** Used to deterministically pick a layout variant. Typically the article title or slug. */
  seed?: string
}

export function buildCoverImageVisualPrompt(params: CoverImageVisualParams): string {
  const {
    hook,
    rightVisual = 'a clean workflow diagram or icon feature grid relevant to the topic',
    benefits = [],
    topicBadge = '',
    accentColor = 'cyan',
    seed = hook,
  } = params

  const accent = ACCENT_GRADIENTS[accentColor] ? accentColor : 'cyan'
  const gradient = ACCENT_GRADIENTS[accent]
  const archetype = pickArchetype(seed)

  const brief = archetype.brief({ hook, rightVisual, benefits, topicBadge, accent, gradient })

  return `Professional blog cover image — designed like an expert Canva or Figma media creator. NOT a photograph or abstract art.

CANVAS: 1792×1024px (16:9 widescreen). Minimum 80px safe margins from each edge. All text legible at full size.

QUALITY STANDARDS:
- Looks like it was built by a senior designer — clean alignment, consistent spacing, typographic hierarchy
- All text crisp and readable — no blurry fonts, no tiny unreadable labels
- Professional typography: heavy bold sans-serif headlines, lighter supporting text
- Color palette is cohesive — accent color (${accent}) used consistently across icons, gradients, and borders






HOOK TEXT RULES:
- The on-image headline MUST be "${hook}" — render this exactly as the dominant text
- Do NOT use the blog article title as-is; the hook is a separate punchy phrase

──── SELECTED LAYOUT: ${archetype.name} ────

${brief}

──── END LAYOUT ────

Final check before rendering: headline is the largest, most prominent text element. The design has clear visual hierarchy. No element overlaps important text. Color contrast meets accessibility standards.`
}
