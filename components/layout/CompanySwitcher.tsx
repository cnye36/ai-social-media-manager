'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Plus, Building2, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Company } from '@/types/database'

interface CompanySwitcherProps {
  companies: Company[]
  currentCompanyId: string
}

export function CompanySwitcher({ companies, currentCompanyId }: CompanySwitcherProps) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const current = companies.find(c => c.id === currentCompanyId)

  function switchCompany(id: string) {
    setOpen(false)
    router.push(`/${id}`)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors text-left"
      >
        <div className="flex-shrink-0 w-6 h-6 rounded bg-violet-600 flex items-center justify-center">
          <Building2 className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="flex-1 text-sm font-medium text-white truncate">
          {current?.name ?? 'Select company'}
        </span>
        <ChevronDown className={cn('w-4 h-4 text-zinc-400 flex-shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 overflow-hidden">
          {companies.map(company => (
            <button
              key={company.id}
              onClick={() => switchCompany(company.id)}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-zinc-700 transition-colors text-left"
            >
              <div className="flex-shrink-0 w-5 h-5 rounded bg-violet-600/50 flex items-center justify-center">
                <Building2 className="w-3 h-3 text-violet-300" />
              </div>
              <span className="flex-1 text-white truncate">{company.name}</span>
              {company.id === currentCompanyId && (
                <Check className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" />
              )}
            </button>
          ))}
          <div className="border-t border-zinc-700">
            <button
              onClick={() => { setOpen(false); router.push('/companies/new') }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add company
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
