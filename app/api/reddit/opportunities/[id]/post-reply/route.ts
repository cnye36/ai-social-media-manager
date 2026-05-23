import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { postRedditReply } from '@/lib/reddit/post-reply'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = (await req.json()) as { companyId?: string }
  if (!body.companyId) {
    return NextResponse.json({ error: 'companyId required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('id', body.companyId)
    .single()

  if (!company) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const result = await postRedditReply(id, body.companyId)
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Post reply failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
