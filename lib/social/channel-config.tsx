import { LinkedInIcon, XIcon, FacebookIcon } from '@/components/ui/channel-icons'
import type { ContentGoal, PostLength } from '@/types/agents'

export type SocialChannel = 'linkedin' | 'x' | 'facebook'
export type ChannelVoice = 'personal' | 'company'

export const SOCIAL_CHANNELS: readonly SocialChannel[] = ['linkedin', 'x', 'facebook']

export interface ChannelConfig {
  id: SocialChannel
  /** Full page title, e.g. "X (Twitter)" */
  name: string
  /** Short name used in history heading / empty states, e.g. "X" */
  shortName: string
  Icon: React.ComponentType<{ className?: string }>
  /** generation_params key — must stay channel-specific so existing posts' badges keep working */
  voiceParamKey: string
  defaults: {
    voice: ChannelVoice
    contentGoal: ContentGoal
    postLength: PostLength
    /** Length used when generating straight from an IdeaSpark idea */
    ideaPostLength: PostLength
  }
  /** The one GOALS entry whose description differs per channel */
  engagementDescription: string
  supportsThreads: boolean
  showMediaPanel: boolean
  /** Voice toggle / badge label for company voice: "Company" | "Company Page" */
  companyVoiceLabel: string
  // ── Styling ────────────────────────────────────────────────────────────────
  /** Header icon tile */
  headerTile: string
  headerIcon: string
  /** Active tab underline tint (channel brand color) */
  tabIndicator: string
  /** Personal-voice accent classes (company voice is always violet) */
  personal: {
    toggleActive: string
    banner: string
    bannerIcon: string
    avatar: string
    avatarIcon: string
    chip: string
  }
  calendarChip: { bg: string; text: string }
  // ── Copy ───────────────────────────────────────────────────────────────────
  copy: {
    subtitle: Record<ChannelVoice, string>
    banner: Record<ChannelVoice, string>
    voiceInstruction: Record<ChannelVoice, string>
    topicPlaceholder: string
    contextPlaceholder: string
    /** Submit button text while generating / idle, per voice (single-post mode) */
    writing: Record<ChannelVoice, string>
    generate: Record<ChannelVoice, string>
  }
}

const COMPANY_TOGGLE_ACTIVE = 'bg-violet-600 text-white shadow-sm'
export const COMPANY_ACCENT = {
  toggleActive: COMPANY_TOGGLE_ACTIVE,
  banner: 'bg-violet-900/10 border-violet-800/40 text-violet-300/80',
  bannerIcon: 'text-violet-400',
  avatar: 'bg-violet-900/40 border-violet-700/40',
  avatarIcon: 'text-violet-400',
  chip: 'text-violet-400 bg-violet-900/20 border-violet-700/30',
}

const BLUE_PERSONAL = {
  toggleActive: 'bg-blue-600 text-white shadow-sm',
  banner: 'bg-blue-900/10 border-blue-800/40 text-blue-300/80',
  bannerIcon: 'text-blue-400',
  avatar: 'bg-blue-900/40 border-blue-700/40',
  avatarIcon: 'text-blue-400',
  chip: 'text-blue-400 bg-blue-900/20 border-blue-700/30',
}

export const CHANNEL_CONFIGS: Record<SocialChannel, ChannelConfig> = {
  linkedin: {
    id: 'linkedin',
    name: 'LinkedIn',
    shortName: 'LinkedIn',
    Icon: LinkedInIcon,
    voiceParamKey: 'linkedin_voice',
    defaults: { voice: 'personal', contentGoal: 'awareness', postLength: 'medium', ideaPostLength: 'medium' },
    engagementDescription: 'Spark comments & shares',
    supportsThreads: false,
    showMediaPanel: true,
    companyVoiceLabel: 'Company',
    headerTile: 'bg-blue-600/15 border-blue-600/25',
    headerIcon: 'text-blue-400',
    tabIndicator: 'bg-[#0A66C2]',
    personal: BLUE_PERSONAL,
    calendarChip: { bg: 'bg-blue-500/15', text: 'text-blue-300' },
    copy: {
      subtitle: {
        personal: 'Personal profile — first-person, story-driven, founder voice',
        company: 'Company page — brand voice, "we" perspective, business outcomes',
      },
      banner: {
        personal:
          'Content will be written in first-person "I" voice as the founder/individual. Best for thought leadership, personal stories, and opinion-driven posts on your personal profile.',
        company:
          'Content will be written in "we/our" voice as the company. Best for brand announcements, client results, product updates, and company milestones on your company page.',
      },
      voiceInstruction: {
        personal:
          'VOICE: Write as a personal LinkedIn post from an individual founder/expert. Use first-person "I" throughout. Be authentic, conversational, and story-driven. Write from the human perspective, not from a company.',
        company:
          'VOICE: Write as a company LinkedIn post. Use "we" and "our" language. Focus on brand, products, client outcomes, and business perspective. Speak as the company, not as an individual.',
      },
      topicPlaceholder: 'e.g. Why most AI implementations fail in the first 90 days',
      contextPlaceholder: 'Any specific angle, data point, or instruction for the AI…',
      writing: { personal: 'Writing personal post…', company: 'Writing company post…' },
      generate: { personal: 'Generate personal post', company: 'Generate company post' },
    },
  },
  x: {
    id: 'x',
    name: 'X (Twitter)',
    shortName: 'X',
    Icon: XIcon,
    voiceParamKey: 'x_voice',
    defaults: { voice: 'personal', contentGoal: 'engagement', postLength: 'short', ideaPostLength: 'short' },
    engagementDescription: 'Spark replies & retweets',
    supportsThreads: true,
    showMediaPanel: false,
    companyVoiceLabel: 'Company',
    headerTile: 'bg-zinc-700/30 border-zinc-600/40',
    headerIcon: 'text-zinc-200',
    tabIndicator: 'bg-zinc-200',
    personal: {
      toggleActive: 'bg-zinc-600 text-white shadow-sm',
      banner: 'bg-zinc-800/50 border-zinc-700/60 text-zinc-400',
      bannerIcon: 'text-zinc-400',
      avatar: 'bg-zinc-700/50 border-zinc-600/50',
      avatarIcon: 'text-zinc-300',
      chip: 'text-zinc-300 bg-zinc-800 border-zinc-600',
    },
    calendarChip: { bg: 'bg-zinc-500/15', text: 'text-zinc-300' },
    copy: {
      subtitle: {
        personal: 'Personal profile — opinionated, first-person, individual takes',
        company: 'Company account — brand voice, sharp and direct',
      },
      banner: {
        personal:
          'Content will be direct, opinionated, and written in first-person "I" voice. Best for hot takes, personal insights, and founder perspective on your personal profile.',
        company:
          'Content will be written in company "we/our" voice while remaining sharp and direct. Best for product updates, company insights, and brand-led posts on your company account.',
      },
      voiceInstruction: {
        personal:
          'VOICE: Write as a personal X post from an individual founder/creator. Use first-person "I" and opinionated language. Be direct, punchy, and authentic. This is the human behind the account, not a brand.',
        company:
          'VOICE: Write as a company X post. Use "we" and "our" language. Keep it brand-appropriate but still sharp and direct — not corporate or generic. Speak as the business.',
      },
      topicPlaceholder: 'e.g. Most AI agents fail because they skip the boring infrastructure',
      contextPlaceholder: 'Any specific angle, stat, or instruction…',
      writing: { personal: 'Writing personal tweet…', company: 'Writing company tweet…' },
      generate: { personal: 'Generate personal tweet', company: 'Generate company tweet' },
    },
  },
  facebook: {
    id: 'facebook',
    name: 'Facebook',
    shortName: 'Facebook',
    Icon: FacebookIcon,
    voiceParamKey: 'facebook_voice',
    defaults: { voice: 'company', contentGoal: 'engagement', postLength: 'medium', ideaPostLength: 'medium' },
    engagementDescription: 'Spark comments & shares',
    supportsThreads: false,
    showMediaPanel: true,
    companyVoiceLabel: 'Company Page',
    headerTile: 'bg-blue-700/20 border-blue-600/30',
    headerIcon: 'text-blue-400',
    tabIndicator: 'bg-[#1877F2]',
    personal: BLUE_PERSONAL,
    calendarChip: { bg: 'bg-blue-400/15', text: 'text-blue-200' },
    copy: {
      subtitle: {
        personal: 'Personal profile — warm, story-driven, authentic individual posts',
        company: 'Company page — community-focused brand voice, warm and engaging',
      },
      banner: {
        personal:
          'Content will be warm, relatable, and first-person "I" voice. Best for personal stories, life updates, and authentic community connection on your personal profile.',
        company:
          'Content will use "we/our" brand voice while staying warm and community-focused. Best for behind-the-scenes content, client stories, team spotlights, and community engagement on your company page.',
      },
      voiceInstruction: {
        personal:
          'VOICE: Write as a personal Facebook post from an individual. Use first-person "I" throughout. Be warm, relatable, and conversational as if sharing with friends and family. Personal stories and authentic emotion work well.',
        company:
          'VOICE: Write as a company Facebook page post. Use "we" and "our" language. Keep the tone warm and community-focused, not corporate. Speak as the brand engaging with its community and customers.',
      },
      topicPlaceholder: 'e.g. A client story about how we saved them 20 hours a week with AI',
      contextPlaceholder: 'Any specific story, angle, or details to include…',
      writing: { personal: 'Writing personal post…', company: 'Writing company post…' },
      generate: { personal: 'Generate personal post', company: 'Generate company page post' },
    },
  },
}
