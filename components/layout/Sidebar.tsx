'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, CalendarDays, Sparkles, FileText, Settings, LogOut, MessageSquareMore, Images, CalendarRange, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { CompanySwitcher } from './CompanySwitcher'
import type { Company } from '@/types/database'

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '' },
  { label: 'Generate', icon: Sparkles, href: '/generate' },
  { label: 'Planner', icon: CalendarRange, href: '/planner' },
  { label: 'Blog', icon: BookOpen, href: '/blog' },
  { label: 'Reddit', icon: MessageSquareMore, href: '/reddit' },
  { label: 'Calendar', icon: CalendarDays, href: '/calendar' },
  { label: 'Posts', icon: FileText, href: '/posts' },
  { label: 'Media', icon: Images, href: '/media' },
  { label: 'Settings', icon: Settings, href: '/settings' },
]

interface SidebarProps {
  companies: Company[]
  currentCompanyId: string
}

export function Sidebar({ companies, currentCompanyId }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="flex flex-col w-60 min-h-screen bg-zinc-900 border-r border-zinc-800 px-3 py-4">
      <div className="mb-6 px-2">
        <span className="text-lg font-bold text-white tracking-tight">SocialAI</span>
      </div>

      <CompanySwitcher companies={companies} currentCompanyId={currentCompanyId} />

      <nav className="flex-1 mt-6 space-y-0.5">
        {navItems.map(({ label, icon: Icon, href }) => {
          const fullHref = `/${currentCompanyId}${href}`
          const isActive = href === ''
            ? pathname === `/${currentCompanyId}`
            : pathname.startsWith(fullHref)

          return (
            <Link
              key={label}
              href={fullHref}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                isActive
                  ? 'bg-violet-600/15 text-violet-300 font-medium'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto space-y-0.5">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
