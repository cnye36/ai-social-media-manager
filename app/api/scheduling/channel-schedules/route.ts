import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getChannelSchedules } from '@/lib/scheduling/next-slot'
import type { Channel } from '@/types/database'

const SOCIAL_CHANNELS: Channel[] = ['linkedin', 'x', 'facebook']

// GET /api/scheduling/channel-schedules?companyId=xxx
// Returns all channel schedules grouped by channel
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = req.nextUrl.searchParams.get('companyId')
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

  const { data: company } = await supabase
    .from('companies').select('id').eq('id', companyId).single()
  if (!company) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Use admin client so we can seed defaults if needed
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const adminSupabase = createAdminClient()

  const schedules: Record<string, unknown[]> = {}
  for (const channel of SOCIAL_CHANNELS) {
    schedules[channel] = await getChannelSchedules(adminSupabase, companyId, channel)
  }

  return NextResponse.json(schedules)
}

// PUT /api/scheduling/channel-schedules
// Body: { companyId, channel, slots: [{day_of_week, hour, minute, timezone, enabled}] }
// Replaces all slots for a channel
export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId, channel, slots } = await req.json() as {
    companyId?: string
    channel?: string
    slots?: Array<{ day_of_week: number; hour: number; minute: number; timezone: string; enabled?: boolean }>
  }

  if (!companyId || !channel || !Array.isArray(slots)) {
    return NextResponse.json({ error: 'companyId, channel, and slots are required' }, { status: 400 })
  }

  if (!SOCIAL_CHANNELS.includes(channel as Channel)) {
    return NextResponse.json({ error: 'Invalid channel' }, { status: 400 })
  }

  const { data: company } = await supabase
    .from('companies').select('id').eq('id', companyId).eq('owner_id', user.id).single()
  if (!company) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Delete existing then insert new (clean replace)
  const { error: delError } = await supabase
    .from('channel_schedules')
    .delete()
    .eq('company_id', companyId)
    .eq('channel', channel)

  if (delError) return NextResponse.json({ error: delError.message }, { status: 500 })

  if (slots.length === 0) return NextResponse.json({ success: true, slots: [] })

  const rows = slots.map(s => ({
    company_id: companyId,
    channel,
    day_of_week: s.day_of_week,
    hour: s.hour,
    minute: s.minute,
    timezone: s.timezone ?? 'America/New_York',
    enabled: s.enabled ?? true,
  }))

  const { data, error } = await supabase
    .from('channel_schedules')
    .insert(rows)
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, slots: data })
}
