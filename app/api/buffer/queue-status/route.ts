import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getBufferQueueStatus } from '@/lib/publishing/buffer-queue'

// GET /api/buffer/queue-status?companyId=xxx
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = req.nextUrl.searchParams.get('companyId')
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

  const { data: company } = await supabase
    .from('companies').select('id').eq('id', companyId).single()
  if (!company) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const status = await getBufferQueueStatus(companyId)
  return NextResponse.json(status)
}
