import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runMonitors } from '@/lib/reddit/monitor'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { companyId?: string }
  if (!body.companyId) {
    return NextResponse.json({ error: 'companyId required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('id', body.companyId)
    .single()

  if (!company) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const result = await runMonitors(body.companyId)
  return NextResponse.json(result)
}
