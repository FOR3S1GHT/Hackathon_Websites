import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from '@/lib/utils'

const Input = React.forwardRef(({ className, type = 'text', ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      'flex h-11 w-full border-[3px] border-black bg-white px-3 py-2 font-mono text-sm text-black',
      'placeholder:text-concrete',
      'focus-visible:outline-none focus-visible:shadow-brutal',
      'disabled:cursor-not-allowed disabled:bg-ash disabled:text-concrete',
      'aria-invalid:border-black aria-invalid:bg-ash',
      className,
    )}
    {...props}
  />
))
Input.displayName = 'Input'

const Textarea = React.forwardRef(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex min-h-[96px] w-full border-[3px] border-black bg-white px-3 py-2 font-mono text-sm text-black',
      'placeholder:text-concrete',
      'focus-visible:outline-none focus-visible:shadow-brutal',
      'disabled:cursor-not-allowed disabled:bg-ash',
      className,
    )}
    {...props}
  />
))
Textarea.displayName = 'Textarea'

/** Label styled as a brutalist field caption rather than a soft grey label. */
const Label = React.forwardRef(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn('brutal-kicker block text-black', className)}
    {...props}
  />
))
Label.displayName = 'Label'

/** Checkbox with a hand-drawn-looking square and a hard tick. */
const Checkbox = React.forwardRef(({ className, checked, indeterminate, ...props }, ref) => (
  <span className={cn('relative inline-flex shrink-0', className)}>
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      className="peer size-5 shrink-0 cursor-pointer appearance-none border-[3px] border-black bg-white checked:bg-black focus-visible:outline-none focus-visible:shadow-brutal-sm disabled:cursor-not-allowed disabled:bg-ash"
      {...props}
    />
    <span
      aria-hidden
      className="pointer-events-none absolute left-[3px] top-[1px] hidden text-[13px] font-black leading-none text-white peer-checked:block"
    >
      ✓
    </span>
    {indeterminate ? (
      <span
        aria-hidden
        className="pointer-events-none absolute left-[3px] top-[6px] block h-[3px] w-[11px] bg-black"
      />
    ) : null}
  </span>
))
Checkbox.displayName = 'Checkbox'

/** Radix switch restyled to a square hard-edged toggle. */
const Switch = React.forwardRef(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center border-[3px] border-black bg-white',
      'focus-visible:outline-none focus-visible:shadow-brutal-sm',
      'disabled:cursor-not-allowed disabled:bg-ash',
      'data-[state=checked]:bg-black',
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        'block size-3.5 bg-black transition-transform duration-150',
        'data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-white',
      )}
    />
  </SwitchPrimitive.Root>
))
Switch.displayName = 'Switch'

export { Input, Textarea, Label, Checkbox, Switch }