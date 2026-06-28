import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const companyId = searchParams.get('companyId')
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

  // Verify ownership
  const { data: company } = await supabase
    .from('companies').select('id').eq('id', companyId).single()
  if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const admin = createAdminClient()
  const { data: logs } = await admin
    .from('rag_query_logs')
    .select('query, result_count, max_similarity')
    .eq('company_id', companyId)
    .gte('created_at', thirtyDaysAgo.toISOString())
    .or('result_count.eq.0,max_similarity.lt.0.45')

  // Group by normalized query, count occurrences
  const counts = new Map<string, { count: number; miss: boolean }>()
  for (const log of logs ?? []) {
    const key = (log.query as string).toLowerCase().trim()
    const existing = counts.get(key)
    const isMiss = (log.result_count as number) === 0
    if (existing) {
      existing.count++
      if (isMiss) existing.miss = true
    } else {
      counts.set(key, { count: 1, miss: isMiss })
    }
  }

  const gaps = Array.from(counts.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8)
    .map(([query, { count, miss }]) => ({ query, count, miss }))

  return NextResponse.json({ gaps })
}
