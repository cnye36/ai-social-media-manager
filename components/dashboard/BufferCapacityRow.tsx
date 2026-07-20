import Link from 'next/link'
import { BarChart3 } from 'lucide-react'
import { LinkedInIcon, XIcon, FacebookIcon } from '@/components/ui/channel-icons'
import { cn } from '@/lib/utils'
import type { Channel } from '@/types/database'

const CHANNEL_ORDER: Channel[] = ['linkedin', 'x', 'facebook']

const CHANNEL_META: Record<string, { label: string; icon: React.ReactNode }> = {
  linkedin: { label: 'LinkedIn', icon: <LinkedInIcon className="w-4 h-4" /> },
  x: { label: 'X / Twitter', icon: <XIcon className="w-4 h-4" /> },
  facebook: { label: 'Facebook', icon: <FacebookIcon className="w-4 h-4" /> },
}

interface QueueStatus {
  inQueue: number
  pending: number
  limit: number
}

interface BufferCapacityRowProps {
  queueStatus: Partial<Record<Channel, QueueStatus>>
  companyId: string
}

export function BufferCapacityRow({ queueStatus, companyId }: BufferCapacityRowProps) {
  const channels = CHANNEL_ORDER.filter(ch => queueStatus[ch])

  if (channels.length === 0) {
    return (
      <div className="mb-8 px-4 py-3 rounded-xl border border-dashed border-zinc-800 text-sm text-zinc-500 flex items-center justify-between">
        <span>Connect Buffer to see how many posts you can schedule per channel right now.</span>
        <Link href={`/${companyId}/settings?tab=connections`} className="text-violet-400 hover:text-violet-300 shrink-0 ml-3">
          Connect
        </Link>
      </div>
    )
  }

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs text-zinc-500 uppercase tracking-wide font-medium flex items-center gap-1.5">
          <BarChart3 className="w-3.5 h-3.5" />
          Buffer capacity — free plan allows 10 queued posts per channel
        </h2>
        <Link href={`/${companyId}/settings?tab=schedule`} className="text-xs text-violet-400 hover:text-violet-300">
          Manage schedule
        </Link>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${channels.length}, minmax(0, 1fr))` }}>
        {channels.map(ch => {
          const status = queueStatus[ch]!
          const available = Math.max(0, status.limit - status.inQueue)
          const full = available === 0
          const meta = CHANNEL_META[ch]
          return (
            <div
              key={ch}
              className={cn(
                'rounded-xl border p-4',
                full ? 'bg-orange-950/20 border-orange-900/40' : 'bg-zinc-900 border-zinc-800'
              )}
            >
              <div className="flex items-center gap-2 text-zinc-400 text-sm mb-2">
                {meta.icon}
                {meta.label}
              </div>
              <p className={cn('text-2xl font-bold', full ? 'text-orange-400' : 'text-white')}>
                {available}
              </p>
              <p className="text-xs text-zinc-500">
                {full ? 'queue full — nothing left to schedule' : 'you can schedule right now'}
              </p>
              <p className="text-xs text-zinc-600 mt-1">
                {status.inQueue}/{status.limit} in Buffer queue
                {status.pending > 0 && ` · +${status.pending} waiting to be queued`}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
