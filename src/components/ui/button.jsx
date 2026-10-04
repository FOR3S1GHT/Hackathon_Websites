import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Neo-Brutalist button.
 *
 * Hard 3px black border, hard offset shadow that grows on hover and collapses
 * on press. No radius beyond 2px — brutalism depends on the corner staying
 * square.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-mono text-xs font-bold uppercase tracking-[0.14em] transition-[transform,box-shadow,background-color,color] duration-150 ease-out select-none disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:stroke-[2.5]',
  {
    variants: {
      variant: {
        default:
          'border-[3px] border-black bg-black text-white shadow-brutal hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-brutal-lg active:translate-x-[1px] active:translate-y-[1px] active:shadow-none',
        invert:
          'border-[3px] border-black bg-white text-black shadow-brutal hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-brutal-lg active:translate-x-[1px] active:translate-y-[1px] active:shadow-none',
        ghost:
          'border-[3px] border-transparent bg-transparent text-black hover:border-black hover:bg-white',
        outline:
          'border-[3px] border-black bg-white text-black hover:bg-black hover:text-white',
        ash:
          'border-[3px] border-black bg-ash text-black hover:bg-black hover:text-white',
        link: 'border-0 bg-transparent p-0 text-black underline decoration-[3px] underline-offset-4 hover:decoration-ash',
        destructive:
          'border-[3px] border-black bg-black text-white shadow-brutal hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-brutal-lg active:translate-x-[1px] active:translate-y-[1px] active:shadow-none',
      },
      size: {
        sm: 'h-9 px-3 text-[11px]',
        default: 'h-11 px-5',
        lg: 'h-14 px-7 text-sm',
        icon: 'h-11 w-11',
        'icon-sm': 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button'
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
})
Button.displayName = 'Button'

export { Button, buttonVariants }