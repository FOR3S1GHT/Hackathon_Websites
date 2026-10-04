import * as React from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/** Loading placeholder. Uses the shimmer sweep, never a spinner. */
function Skeleton({ className, ...props }) {
  return <div className={cn('skeleton-brutal border-[3px] border-black', className)} {...props} />
}

const avatarVariants = cva(
  'relative flex shrink-0 overflow-hidden border-[3px] border-black bg-ash select-none',
  {
    variants: {
      size: {
        sm: 'size-8',
        default: 'size-11',
        lg: 'size-16',
        xl: 'size-24',
      },
      shape: {
        square: 'rounded-none',
        circle: 'rounded-full',
      },
    },
    defaultVariants: { size: 'default', shape: 'square' },
  },
)

const Avatar = React.forwardRef(({ className, size, shape, ...props }, ref) => (
  <span ref={ref} className={cn(avatarVariants({ size, shape }), className)} {...props} />
))
Avatar.displayName = 'Avatar'

const AvatarFallback = React.forwardRef(({ className, ...props }, ref) => (
  <span
    ref={ref}
    className={cn(
      'flex size-full items-center justify-center bg-black font-display text-sm uppercase text-white',
      className,
    )}
    {...props}
  />
))
AvatarFallback.displayName = 'AvatarFallback'

export { Skeleton, Avatar, AvatarFallback }