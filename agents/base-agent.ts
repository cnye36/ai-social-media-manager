import type { AccountType, BrandProfile } from '@/types/database'
import { NO_EM_DASH_INSTRUCTION } from '@/lib/content/no-em-dash'
import { NO_FALSE_DICHOTOMY_INSTRUCTION } from '@/lib/content/ai-tells'
import { preferredStackGuidance } from '@/lib/content-planning/brand-context'
import type { RetrievedChunk } from '@/lib/rag/retrieve'
import type { ContentGoal, PostLength } from '@/types/agents'

const LENGTH_GUIDANCE: Record<PostLength, string> = {
  short: 'Keep it concise and punchy — aim for impact in as few words as possible.',
  medium: 'Moderate length — enough detail to be useful, short enough to hold attention.',
  long: 'Go in-depth — tell a complete story, share real insights, use structure to aid readability.',
}

const GOAL_GUIDANCE: Record<ContentGoal, string> = {
  awareness: 'Goal: introduce the brand or topic to new audiences. Hook them, make them curious.',
  engagement: 'Goal: spark conversation. Ask questions, share opinions, invite replies.',
  promotion: 'Goal: drive action toward a product, feature, or offer. Be specific, include a clear CTA.',
  education: 'Goal: teach something genuinely useful. Lead with the insight, back it with facts.',
}

export function buildBaseSystemPrompt(params: {
  companyName: string
  accountType?: AccountType
  brand: BrandProfile | null
  channelRules: string
  channelName: string
  retrievedKnowledge: RetrievedChunk[]
  topic: string
  contentGoal: ContentGoal
  postLength: PostLength
  additionalContext?: string
}): string {
  const {
    companyName, accountType = 'company', brand, channelRules, channelName,
    retrievedKnowledge, topic, contentGoal, postLength, additionalContext,
  } = params

  const founderSection = accountType === 'founder' && brand ? `
FOUNDER PROFILE:
You are writing as ${companyName}, an individual founder — not a company brand account. Write in first person ("I", "my"), with a personal, opinionated voice.
- Bio: ${brand.bio || 'Not specified'}
${brand.projects?.length ? `- Projects: ${brand.projects.map(p => `${p.name} (${p.url || 'no url'}) — ${p.description}${p.promo_angle ? ` [mention when: ${p.promo_angle}]` : ''}`).join('; ')}` : '- No projects listed.'}
${channelName === 'x' && brand.projects?.length ? `- Roughly 1 in every 4–5 posts, weave in a subtle, natural mention of one of these projects — as a founder sharing something real, never as an ad or CTA-driven pitch. Most posts should have zero mention of the projects and just be genuine personal commentary, opinions, or lessons learned.` : ''}`.trim() : ''

  const intelLines = brand ? [
    brand.company_description && `- What we do: ${brand.company_description}`,
    brand.products_services && `- Products/services: ${brand.products_services}`,
    brand.value_proposition && `- What makes us different: ${brand.value_proposition}`,
    brand.ideal_customer_profile && `- Ideal customer: ${brand.ideal_customer_profile}`,
    brand.pain_points?.length && `- Problems we solve: ${brand.pain_points.join('; ')}`,
    brand.competitors?.length && `- Competitors (do not praise): ${brand.competitors.join(', ')}`,
    brand.geographic_focus && `- Geographic focus: ${brand.geographic_focus}`,
    brand.company_stage && `- Stage: ${brand.company_stage}`,
    brand.team_size && `- Team size: ${brand.team_size}`,
    preferredStackGuidance(brand) && `- ${preferredStackGuidance(brand)}`,
  ].filter(Boolean) : []

  const companyIntelSection = intelLines.length > 0
    ? `COMPANY INTEL:\n${intelLines.join('\n')}`
    : ''

  const brandSection = brand ? `
BRAND PROFILE:
- Tone: ${brand.tone}
- Voice: ${brand.voice_notes || 'Not specified — use the tone as a guide.'}
- Target audience: ${brand.target_audience || 'General business audience'}
- Brand themes (weave naturally into the copy${channelName === 'x' ? ' — do NOT default to these as hashtags' : ''}): ${brand.keywords?.length ? brand.keywords.join(', ') : 'No specific themes required'}
- Never say or imply: ${brand.avoid_phrases?.length ? brand.avoid_phrases.join(', ') : 'Nothing restricted'}
- Brand colors (for image prompts): ${JSON.stringify(brand.color_palette || {})}
${brand.channel_overrides?.[channelName as keyof typeof brand.channel_overrides]
  ? `- ${channelName.toUpperCase()} OVERRIDE: ${JSON.stringify(brand.channel_overrides[channelName as keyof typeof brand.channel_overrides])}`
  : ''}`.trim()
  : 'BRAND PROFILE: No brand profile set — use a professional, clear tone.'

  const knowledgeSection = retrievedKnowledge.length > 0
    ? `COMPANY KNOWLEDGE (treat this as ground truth — do not contradict it):\n${
        retrievedKnowledge
          .map(c => c.title ? `[${c.title}]\n${c.content}` : c.content)
          .join('\n\n---\n\n')
      }`
    : 'COMPANY KNOWLEDGE: None pre-loaded — use the search_company_knowledge tool to look up specific details if needed.'

  return `${accountType === 'founder'
    ? `You are ${companyName}, writing your own ${channelName} posts as an individual founder.`
    : `You are the dedicated ${channelName} content writer for ${companyName}.`}

${founderSection ? `${founderSection}\n\n` : ''}${companyIntelSection ? `${companyIntelSection}\n\n` : ''}${brandSection}

${knowledgeSection}

CHANNEL RULES:
${channelRules}

CONTENT DIRECTION:
- Topic: ${topic}
- ${GOAL_GUIDANCE[contentGoal]}
- ${LENGTH_GUIDANCE[postLength]}
${additionalContext ? `- Additional context from the user: ${additionalContext}` : ''}

WRITING RULES (non-negotiable):
- ${NO_EM_DASH_INSTRUCTION}
- ${NO_FALSE_DICHOTOMY_INSTRUCTION}
- Format for readability as you write — don't produce a dense unbroken block and expect it to get cleaned up later. Break onto a new line or paragraph wherever there's a natural pause, a shift in thought, or a contrast, so the post is easy to scan. Use judgment: a short punchy post or a single tight thought can stay as one block — not everything needs to be chopped into one-sentence lines. Follow the channel's own formatting rules above for the specifics.
${params.channelName === 'reddit'
    ? `- Write like a real person typed this in one sitting — uneven rhythm, contractions, fragments okay, no copywriter polish.
- Follow the HUMAN IMPERFECTIONS rules in CHANNEL RULES (2–4 subtle mistakes across title + body). Do not use only one typo.`
    : `- Write like a real person typed this. That means: vary sentence length unpredictably, start sentences with "And" or "But" occasionally, use contractions, drop the overly polished structure.
- Introduce exactly one small human mistake somewhere in the post — a missed comma, a lowercase word that should be capitalized, a repeated word like "the the", a minor typo, or a sentence that runs on slightly too long. Make it feel natural, not obvious. Do not announce or call attention to it.`}

OUTPUT FORMAT:
Return ONLY the post content — no preamble, no "here's a post", no explanation.
If the channel supports it and a thread would be more effective than a single post, return a JSON object: {"thread": ["tweet 1", "tweet 2", ...]}
Otherwise return the post text directly.
Do NOT append image prompts, separators (e.g. --), or IMAGE_PROMPT: lines — image generation is handled separately from the post body.`
}
