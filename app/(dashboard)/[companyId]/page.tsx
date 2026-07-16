import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Sparkles, CalendarDays, FileText, BookOpen } from 'lucide-react'
import { DashboardPostList } from '@/components/posts/DashboardPostList'
import type { Post } from '@/types/database'

interface Props {
  params: Promise<{ companyId: string }>
}

export default async function DashboardPage({ params }: Props) {
  const { companyId } = await params
  const supabase = await createClient()

  const [{ data: company }, { data: recentPosts }, { data: scheduledPosts }, { data: knowledgeCount }] =
    await Promise.all([
      supabase.from('companies').select('*').eq('id', companyId).single(),
      supabase.from('posts').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(5),
      supabase.from('posts').select('id').eq('company_id', companyId).eq('status', 'scheduled'),
      supabase.from('knowledge_chunks').select('id', { count: 'exact' }).eq('company_id', companyId),
    ])

  const stats = [
    { label: 'Drafts this week', value: recentPosts?.filter(p => p.status === 'draft').length ?? 0, icon: FileText, href: `/${companyId}/posts?status=draft` },
    { label: 'Scheduled', value: scheduledPosts?.length ?? 0, icon: CalendarDays, href: `/${companyId}/calendar` },
    { label: 'Knowledge entries', value: knowledgeCount?.length ?? 0, icon: BookOpen, href: `/${companyId}/settings?tab=knowledge` },
  ]

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold text-white">{company?.name}</h1>
        <p className="text-zinc-400 mt-1 text-sm">Welcome back — here's your content overview</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        {stats.map(({ label, value, icon: Icon, href }) => (
          <Link
            key={label}
            href={href}
            className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-zinc-400 text-sm">{label}</span>
              <Icon className="w-4 h-4 text-zinc-600" />
            </div>
            <span className="text-3xl font-bold text-white">{value}</span>
          </Link>
        ))}
      </div>

      <div className="flex gap-3 mb-8">
        <Link
          href={`/${companyId}/social`}
          className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-lg font-medium hover:bg-violet-500 transition-colors"
        >
          <Sparkles className="w-4 h-4" />
          Generate Post
        </Link>
        <Link
          href={`/${companyId}/settings?tab=knowledge`}
          className="flex items-center gap-2 px-5 py-2.5 bg-zinc-800 text-white rounded-lg font-medium hover:bg-zinc-700 transition-colors"
        >
          <BookOpen className="w-4 h-4" />
          Add Knowledge
        </Link>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl">
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="font-semibold text-white">Recent posts</h2>
          <Link href={`/${companyId}/posts`} className="text-sm text-violet-400 hover:text-violet-300">
            View all
          </Link>
        </div>
        <DashboardPostList posts={(recentPosts ?? []) as Post[]} companyId={companyId} />
      </div>
    </div>
  )
}
