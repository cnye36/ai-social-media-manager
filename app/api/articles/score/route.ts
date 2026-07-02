import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { scoreArticle } from '@/lib/blog/score-article'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { title?: unknown; body?: unknown }
  const { title, body: articleBody } = body

  if (typeof articleBody !== 'string' || !articleBody.trim()) {
    return NextResponse.json({ error: 'body required' }, { status: 400 })
  }

  const result = await scoreArticle(typeof title === 'string' ? title : '', articleBody)
  return NextResponse.json(result)
}
