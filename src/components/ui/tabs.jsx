import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '@/lib/utils'

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn('inline-flex items-stretch border-[3px] border-black bg-white', className)}
    {...props}
  />
))
TabsList.displayName = 'TabsList'

const TabsTrigger = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'relative inline-flex items-center justify-center whitespace-nowrap border-r-[3px] border-black px-4 py-2.5',
      'font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-black transition-colors',
      'last:border-r-0',
      'hover:bg-ash',
      'focus-visible:outline-none focus-visible:shadow-brutal-sm',
      'data-[state=active]:bg-black data-[state=active]:text-white',
      'disabled:pointer-events-none disabled:opacity-40',
      className,
    )}
    {...props}
  />
))
TabsTrigger.displayName = 'TabsTrigger'

const TabsContent = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'focus-visible:outline-none',
      'data-[state=active]:animate-in data-[state=active]:fade-in-0',
      className,
    )}
    {...props}
  />
))
TabsContent.displayName = 'TabsContent'

export { Tabs, TabsList, TabsTrigger, TabsContent }