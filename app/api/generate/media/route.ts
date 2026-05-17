import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateMedia } from '@/agents/media-agent'

export const maxDuration = 90

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { postContent, companyId, channel, refinementNote, brandColors } = body

  if (!postContent || !companyId || !channel) {
    return NextResponse.json({ error: 'postContent, companyId, and channel are required' }, { status: 400 })
  }

  // Verify user has access to this company
  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .maybeSingle()

  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  try {
    const result = await generateMedia({ postContent, companyId, channel, refinementNote, brandColors })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[media-agent]', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
