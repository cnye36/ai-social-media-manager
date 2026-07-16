'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, CalendarDays, Share2, FileText, Settings, LogOut, MessageSquareMore, Images, CalendarRange, BookOpen, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { CompanySwitcher } from './CompanySwitcher'
import type { Company } from '@/types/database'

interface NavItem {
  label: string
  icon: LucideIcon
  href: string
}

const navSections: { label: string | null; items: NavItem[] }[] = [
  {
    label: null,
    items: [{ label: 'Dashboard', icon: LayoutDashboard, href: '' }],
  },
  {
    label: 'Create',
    items: [
      { label: 'Social', icon: Share2, href: '/social' },
      { label: 'Reddit', icon: MessageSquareMore, href: '/reddit' },
      { label: 'Blog', icon: BookOpen, href: '/blog' },
    ],
  },
  {
    label: 'Plan',
    items: [
      { label: 'Planner', icon: CalendarRange, href: '/planner' },
      { label: 'Calendar', icon: CalendarDays, href: '/calendar' },
    ],
  },
  {
    label: 'Library',
    items: [
      { label: 'Posts', icon: FileText, href: '/posts' },
      { label: 'Media', icon: Images, href: '/media' },
    ],
  },
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

  function renderItem({ label, icon: Icon, href }: NavItem) {
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
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50',
          isActive
            ? 'bg-violet-600/15 text-violet-300 font-medium'
            : 'text-zinc-400 hover:text-white hover:bg-surface-2'
        )}
      >
        <Icon className="w-4 h-4 flex-shrink-0" />
        {label}
      </Link>
    )
  }

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col bg-surface-1 border-r border-edge px-3 py-4">
      <div className="mb-6 px-2">
        <span className="font-display text-lg font-extrabold text-white tracking-tight">SocialAI</span>
      </div>

      <CompanySwitcher companies={companies} currentCompanyId={currentCompanyId} />

      <nav className="flex-1 mt-6 overflow-y-auto">
        {navSections.map(section => (
          <div key={section.label ?? 'top'} className="mb-5">
            {section.label && (
              <p className="px-3 mb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-600">
                {section.label}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map(renderItem)}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-auto space-y-0.5 pt-3 border-t border-edge">
        {renderItem({ label: 'Settings', icon: Settings, href: '/settings' })}
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-red-400 hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
