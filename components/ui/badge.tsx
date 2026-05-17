import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-violet-600/20 text-violet-300',
        linkedin: 'bg-blue-600/20 text-blue-300',
        x: 'bg-zinc-600/20 text-zinc-300',
        reddit: 'bg-orange-600/20 text-orange-300',
        facebook: 'bg-blue-400/20 text-blue-200',
        draft: 'bg-zinc-700 text-zinc-400',
        scheduled: 'bg-yellow-600/20 text-yellow-300',
        published: 'bg-green-600/20 text-green-300',
        archived: 'bg-zinc-800 text-zinc-500',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
