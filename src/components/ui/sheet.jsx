import * as React from 'react'
import * as SheetPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDialogScrollLock } from '@/hooks/use-dialog-scroll-lock'

/**
 * Sheet — a Dialog anchored to an edge. Used for the mobile navigation drawer
 * and for filter panels on small screens.
 */
const Sheet = SheetPrimitive.Root
const SheetTrigger = SheetPrimitive.Trigger
const SheetClose = SheetPrimitive.Close
const SheetPortal = SheetPrimitive.Portal

/**
 * Radix only mounts the content while the sheet is open, so a child component
 * can hold the scroll lock for exactly that lifetime without any state plumbing.
 */
function SheetScrollLock() {
  useDialogScrollLock(true)
  return null
}

const SheetOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/70',
      'data-[state=open]:animate-in data-[state=open]:fade-in-0',
      'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
      className,
    )}
    {...props}
  />
))
SheetOverlay.displayName = 'SheetOverlay'

const sheetSides = {
  top: 'inset-x-0 top-0 border-b-[3px] data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
  bottom:
    'inset-x-0 bottom-0 border-t-[3px] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
  left: 'inset-y-0 left-0 h-full w-[86%] max-w-sm border-r-[3px] data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left',
  right:
    'inset-y-0 right-0 h-full w-[86%] max-w-sm border-l-[3px] data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
}

const SheetContent = React.forwardRef(({ side = 'right', className, children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <SheetPrimitive.Content
      ref={ref}
      className={cn(
        'fixed z-50 flex flex-col bg-white text-black shadow-brutal-xl transition ease-in-out',
        'data-[state=open]:animate-in data-[state=open]:duration-300',
        'data-[state=closed]:animate-out data-[state=closed]:duration-200',
        sheetSides[side],
        className,
      )}
      {...props}
    >
      <SheetScrollLock />
      {children}
      <SheetPrimitive.Close
        aria-label="Close panel"
        className="absolute right-4 top-4 flex size-10 items-center justify-center border-[3px] border-black bg-white transition-colors hover:bg-black hover:text-white"
      >
        <X className="size-5 stroke-[3]" />
      </SheetPrimitive.Close>
    </SheetPrimitive.Content>
  </SheetPortal>
))
SheetContent.displayName = 'SheetContent'

function SheetHeader({ className, ...props }) {
  return <div className={cn('border-b-[3px] border-black p-6 pr-16', className)} {...props} />
}

function SheetFooter({ className, ...props }) {
  return <div className={cn('mt-auto border-t-[3px] border-black p-6', className)} {...props} />
}

const SheetTitle = React.forwardRef(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn('font-display text-2xl uppercase leading-none tracking-[-0.02em]', className)}
    {...props}
  />
))
SheetTitle.displayName = 'SheetTitle'

const SheetDescription = React.forwardRef(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn('mt-2 text-sm leading-relaxed text-soot', className)}
    {...props}
  />
))
SheetDescription.displayName = 'SheetDescription'

export {
  Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetFooter,
  SheetTitle, SheetDescription,
}