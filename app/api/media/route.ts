import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { MediaLibraryItem } from '@/types/database'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get('companyId')
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .eq('owner_id', user.id)
    .single()
  if (!company) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabase
    .from('media_library')
    .select(`
      id, company_id, storage_path, url, prompt, alt_text, type, svg, post_id, created_at,
      posts:post_id ( id, channel, content )
    `)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('[media-library] query error:', error.message, error.code)
    return NextResponse.json({ error: error.message, code: error.code, items: [] }, { status: 500 })
  }

  return NextResponse.json({ items: (data ?? []) as unknown as MediaLibraryItem[] })
}
