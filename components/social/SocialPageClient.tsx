'use client'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useUrlTab } from '@/lib/hooks/use-url-tab'
import { CHANNEL_CONFIGS, SOCIAL_CHANNELS, type SocialChannel } from '@/lib/social/channel-config'
import { ChannelPageClient } from './ChannelPageClient'

interface SocialPageClientProps {
  companyId: string
  brandColors?: { primary?: string; accent?: string }
}

export function SocialPageClient({ companyId, brandColors }: SocialPageClientProps) {
  const [channel, setChannel] = useUrlTab<SocialChannel>('channel', SOCIAL_CHANNELS, 'linkedin')

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        <Tabs value={channel} onValueChange={v => setChannel(v as SocialChannel)}>
          <TabsList>
            {SOCIAL_CHANNELS.map(id => {
              const { Icon, shortName, tabIndicator } = CHANNEL_CONFIGS[id]
              return (
                <TabsTrigger key={id} value={id} indicatorClass={tabIndicator}>
                  <Icon className="w-4 h-4" />
                  {shortName}
                </TabsTrigger>
              )
            })}
          </TabsList>
        </Tabs>

        {/* key resets form state on tab switch — same behavior as the old per-channel pages */}
        <ChannelPageClient
          key={channel}
          config={CHANNEL_CONFIGS[channel]}
          companyId={companyId}
          brandColors={brandColors}
        />
      </div>
    </div>
  )
}
