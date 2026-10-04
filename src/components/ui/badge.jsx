import * as React from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Badge. `solid` is the loud variant used for statuses; `outline` is for
 * low-emphasis metadata. Rounded corners are deliberately absent.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1 border-2 px-2 py-[3px] font-mono text-[10px] font-bold uppercase tracking-[0.14em] leading-none [&_svg]:size-3 [&_svg]:stroke-[3]',
  {
    variants: {
      variant: {
        solid: 'border-black bg-black text-white',
        outline: 'border-black bg-white text-black',
        ash: 'border-black bg-ash text-black',
        invert: 'border-white bg-white text-black',
        onInk: 'border-white bg-transparent text-white',
        subtle: 'border-concrete bg-white text-soot',
      },
      size: {
        default: '',
        sm: 'px-1.5 py-0 text-[9px]',
        lg: 'px-3 py-1.5 text-xs',
      },
    },
    defaultVariants: { variant: 'outline', size: 'default' },
  },
)

const Badge = React.forwardRef(({ className, variant, size, as: Tag = 'span', ...props }, ref) => (
  <Tag ref={ref} className={cn(badgeVariants({ variant, size }), className)} {...props} />
))
Badge.displayName = 'Badge'

export { Badge, badgeVariants }