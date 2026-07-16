'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface TabsContextValue {
  value: string
  onValueChange: (value: string) => void
}

const TabsContext = React.createContext<TabsContextValue | null>(null)

function useTabsContext(component: string): TabsContextValue {
  const ctx = React.useContext(TabsContext)
  if (!ctx) throw new Error(`<${component}> must be used inside <Tabs>`)
  return ctx
}

interface TabsProps {
  value: string
  onValueChange: (value: string) => void
  className?: string
  children: React.ReactNode
}

export function Tabs({ value, onValueChange, className, children }: TabsProps) {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  )
}

export function TabsList({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div role="tablist" className={cn('flex items-center gap-1 border-b border-edge', className)}>
      {children}
    </div>
  )
}

interface TabsTriggerProps {
  value: string
  className?: string
  /** Classes for the active underline indicator, e.g. a channel brand tint. Defaults to violet. */
  indicatorClass?: string
  children: React.ReactNode
}

export function TabsTrigger({ value, className, indicatorClass, children }: TabsTriggerProps) {
  const ctx = useTabsContext('TabsTrigger')
  const isActive = ctx.value === value
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={() => ctx.onValueChange(value)}
      className={cn(
        'relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors rounded-t-lg',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50',
        isActive ? 'text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-surface-2/60',
        className
      )}
    >
      {children}
      <span
        aria-hidden
        className={cn(
          'absolute inset-x-1 -bottom-px h-0.5 rounded-full origin-left transition-transform duration-200 motion-reduce:transition-none',
          isActive ? 'scale-x-100' : 'scale-x-0',
          indicatorClass ?? 'bg-violet-500'
        )}
      />
    </button>
  )
}

interface TabsContentProps {
  value: string
  className?: string
  children: React.ReactNode
}

export function TabsContent({ value, className, children }: TabsContentProps) {
  const ctx = useTabsContext('TabsContent')
  if (ctx.value !== value) return null
  return (
    <div role="tabpanel" className={className}>
      {children}
    </div>
  )
}
