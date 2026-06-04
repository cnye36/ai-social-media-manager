'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { Send, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Channel } from '@/types/database'

const BUFFER_CHANNELS = new Set<Channel>(['linkedin', 'x', 'facebook'])

interface SendToBufferButtonProps {
  postId: string
  channel: Channel
  scheduledFor: string | null
  bufferPostId?: string | null
  size?: 'sm' | 'default'
  className?: string
  onSuccess?: (post: { scheduled_for?: string | null; buffer_post_id?: string | null }) => void
}

export function SendToBufferButton({
  postId,
  channel,
  scheduledFor,
  bufferPostId,
  size = 'sm',
  className,
  onSuccess,
}: SendToBufferButtonProps) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>(
    bufferPostId ? 'sent' : 'idle',
  )
  const [error, setError] = useState('')
  const [queuedAt, setQueuedAt] = useState<string | null>(scheduledFor)

  if (!BUFFER_CHANNELS.has(channel)) return null
  if (bufferPostId || state === 'sent') {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-xs text-green-400', className)}>
        <Check className="w-3.5 h-3.5" />
        {queuedAt ? `In Buffer · ${format(new Date(queuedAt), 'MMM d · h:mm a')}` : 'In Buffer'}
      </span>
    )
  }

  async function handleSend() {
    if (!scheduledFor) {
      setError('Set a schedule date and time first.')
      setState('error')
      return
    }

    setState('sending')
    setError('')

    const res = await fetch('/api/buffer/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId }),
    })

    if (res.ok) {
      const data = await res.json() as {
        scheduledFor?: string
        post?: { scheduled_for?: string | null; buffer_post_id?: string | null }
      }
      const at = data.post?.scheduled_for ?? data.scheduledFor ?? scheduledFor
      setQueuedAt(at ?? null)
      setState('sent')
      if (data.post) onSuccess?.(data.post)
    } else {
      const d = await res.json().catch(() => ({}))
      setError(typeof d.error === 'string' ? d.error : 'Failed to send to Buffer')
      setState('error')
    }
  }

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <Button
        variant="secondary"
        size={size}
        onClick={handleSend}
        disabled={state === 'sending'}
        title={scheduledFor ? 'Send to Buffer at your scheduled time' : 'Set a schedule time first'}
      >
        {state === 'sending' ? (
          'Sending…'
        ) : (
          <>
            <Send className="w-3.5 h-3.5" />
            Send to Buffer
          </>
        )}
      </Button>
      {state === 'error' && error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </div>
  )
}
