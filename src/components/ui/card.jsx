import * as React from 'react'
import { cn } from '@/lib/utils'

/** Square, 3px-bordered card with an optional hard shadow. */
const Card = React.forwardRef(({ className, shadow = true, as: Tag = 'div', ...props }, ref) => (
  <Tag
    ref={ref}
    className={cn(
      'border-[3px] border-black bg-white text-black',
      shadow && 'shadow-brutal',
      className,
    )}
    {...props}
  />
))
Card.displayName = 'Card'

const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex flex-col gap-2 border-b-[3px] border-black p-5', className)} {...props} />
))
CardHeader.displayName = 'CardHeader'

const CardTitle = React.forwardRef(({ className, as: Tag = 'h3', ...props }, ref) => (
  <Tag
    ref={ref}
    className={cn('font-display text-xl uppercase leading-none tracking-[-0.02em]', className)}
    {...props}
  />
))
CardTitle.displayName = 'CardTitle'

const CardDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm leading-relaxed text-soot', className)} {...props} />
))
CardDescription.displayName = 'CardDescription'

const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-5', className)} {...props} />
))
CardContent.displayName = 'CardContent'

const CardFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex items-center gap-3 border-t-[3px] border-black p-5', className)} {...props} />
))
CardFooter.displayName = 'CardFooter'

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter }