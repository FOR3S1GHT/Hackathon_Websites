import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDialogScrollLock } from '@/hooks/use-dialog-scroll-lock'

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

/** Held for exactly as long as Radix keeps the content mounted. */
function DialogScrollLock() {
  useDialogScrollLock(true)
  return null
}

/**
 * Modal.
 *
 * Critical: Radix Dialog locks body scroll and applies `pointer-events: none`
 * to the rest of the page. Lenis drives scrolling on the same element, so it is
 * paused on open and resumed on close (see useDialogScrollLock). Without that,
 * the page appears to scroll under the overlay.
 */
const DialogOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
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
DialogOverlay.displayName = 'DialogOverlay'

const DialogContent = React.forwardRef(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-1/2 top-1/2 z-50 grid w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2',
        'max-h-[calc(100vh-4rem)] overflow-y-auto border-[3px] border-black bg-white shadow-brutal-xl',
        'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
        className,
      )}
      {...props}
    >
      <DialogScrollLock />
      {children}
      <DialogPrimitive.Close
        aria-label="Close dialog"
        className="absolute right-3 top-3 flex size-9 items-center justify-center border-[3px] border-black bg-white text-black transition-transform hover:bg-black hover:text-white active:translate-x-[1px] active:translate-y-[1px]"
      >
        <X className="size-4 stroke-[3]" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = 'DialogContent'

function DialogHeader({ className, ...props }) {
  return <div className={cn('border-b-[3px] border-black p-6 pr-16', className)} {...props} />
}

function DialogFooter({ className, ...props }) {
  return (
    <div
      className={cn('flex flex-col-reverse gap-3 border-t-[3px] border-black p-6 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  )
}

const DialogTitle = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('font-display text-2xl uppercase leading-none tracking-[-0.02em]', className)}
    {...props}
  />
))
DialogTitle.displayName = 'DialogTitle'

const DialogDescription = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('mt-2 text-sm leading-relaxed text-soot', className)}
    {...props}
  />
))
DialogDescription.displayName = 'DialogDescription'

export {
  Dialog, DialogPortal, DialogOverlay, DialogClose, DialogTrigger,
  DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
}