import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { publish } from '@/lib/publishing'
import type { Post } from '@/types/database'

// Called every minute by Vercel Cron (vercel.json) or any external cron service.
// Protected by CRON_SECRET env var — Vercel injects it automatically via the
// Authorization header when using vercel.json cron config.
export async function GET(request: Request) {
  const auth = request.headers.get('Authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()

  const { data: duePosts, error } = await supabase
    .from('posts')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_for', new Date().toISOString())
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!duePosts?.length) return NextResponse.json({ published: 0 })

  const results = await Promise.allSettled(
    (duePosts as Post[]).map(async (post) => {
      await publish(post)
      await supabase
        .from('posts')
        .update({ status: 'published', published_at: new Date().toISOString() })
        .eq('id', post.id)
      return post.id
    })
  )

  const published = results.filter(r => r.status === 'fulfilled').length
  const failed = results
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map(r => (r.reason as Error)?.message)

  if (failed.length) console.error('Publish failures:', failed)

  return NextResponse.json({ published, failed: failed.length, total: duePosts.length })
}
