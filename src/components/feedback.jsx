import { Link } from 'react-router-dom'
import { AlertTriangle, Inbox, RotateCw, SearchX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/** Section header: oversized kicker + title, with an optional right-hand slot. */
export function SectionHeader({ kicker, title, description, action, className, id }) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="max-w-2xl">
        {kicker ? <p className="brutal-kicker">{kicker}</p> : null}
        <h2
          id={id}
          className="mt-2 font-display text-3xl uppercase leading-[0.95] tracking-[-0.03em] sm:text-4xl"
        >
          {title}
        </h2>
        {description ? (
          <p className="mt-3 text-sm leading-relaxed text-soot sm:text-base">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

/** Page-level title block used by every interior page. */
export function PageHeader({ kicker, title, description, action, children, className }) {
  return (
    <header className={cn('border-b-[3px] border-black pb-8', className)}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          {kicker ? <p className="brutal-kicker">{kicker}</p> : null}
          <h1 className="mt-2 font-display text-4xl uppercase leading-[0.9] tracking-[-0.035em] sm:text-6xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-soot">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </header>
  )
}

/** Empty state with a concrete next action rather than a shrug. */
export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
  tone = 'neutral',
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 border-[3px] border-dashed border-black px-6 py-16 text-center',
        tone === 'solid' && 'bg-ash',
        className,
      )}
      role="status"
    >
      <span className="flex size-16 items-center justify-center border-[3px] border-black bg-white">
        <Icon className="size-7 stroke-[2.5]" />
      </span>
      <div className="max-w-md space-y-2">
        <h3 className="font-display text-2xl uppercase leading-none tracking-[-0.02em]">{title}</h3>
        {description ? <p className="text-sm leading-relaxed text-soot">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}

export function NoResults({ query, onClear, description }) {
  return (
    <EmptyState
      icon={SearchX}
      title="No hackathons match"
      description={
        description ??
        (query
          ? `Nothing in the catalogue matches “${query}” with the current filters. Try removing a filter or searching for a broader term.`
          : 'No hackathons match the filters you have applied. Try clearing one.')
      }
      action={
        onClear ? (
          <Button variant="outline" onClick={onClear}>
            <RotateCw /> Clear filters
          </Button>
        ) : null
      }
    />
  )
}

/** Error state. Never renders a stack trace or internal error text. */
export function ErrorState({ title = 'Something went wrong', error, onRetry, className }) {
  const message =
    error?.message && !/Failed to fetch|fetch failed/i.test(error.message)
      ? error.message
      : 'The HackRadar API did not respond. Check that the backend is running, then try again.'

  return (
    <Card className={cn('border-[3px] border-black bg-white p-6 shadow-brutal-lg', className)} role="alert">
      <div className="flex items-start gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center border-[3px] border-black bg-black text-white">
          <AlertTriangle className="size-6 stroke-[2.5]" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-xl uppercase leading-none tracking-[-0.02em]">{title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-soot">{message}</p>
          {onRetry ? (
            <Button className="mt-4" onClick={onRetry}>
              <RotateCw /> Try again
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  )
}

/**
 * An inline, dismissible capability notice.
 *
 * Used whenever a feature is credential-gated (AI, push, email) so the UI never
 * pretends a feature is live when it is not.
 */
export function CapabilityNotice({ title, children, action, className, tone = 'stripe' }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 border-[3px] border-black p-4 sm:flex-row sm:items-center sm:justify-between',
        tone === 'stripe' ? 'bg-ash' : 'bg-white',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-1 flex h-6 w-2 shrink-0 border-2 border-black bg-black" />
        <div className="min-w-0">
          <p className="brutal-kicker">{title}</p>
          <div className="mt-1 text-sm leading-relaxed text-soot">{children}</div>
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

/** Card grid skeleton that mirrors the real card's shape to avoid layout shift. */
export function HackathonGridSkeleton({ count = 6 }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-hidden>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex flex-col border-[3px] border-black bg-white shadow-brutal">
          <Skeleton className="aspect-[5/2] border-0" />
          <div className="flex flex-1 flex-col gap-3 p-4">
            <Skeleton className="h-3 w-24 border-0" />
            <Skeleton className="h-6 w-4/5 border-0" />
            <Skeleton className="h-16 w-full border-0" />
            <div className="flex gap-2">
              <Skeleton className="h-6 w-20 border-0" />
              <Skeleton className="h-6 w-16 border-0" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/** Single card skeleton for detail pages. */
export function DetailSkeleton() {
  return (
    <div className="space-y-8" aria-hidden>
      <Skeleton className="h-10 w-2/3 border-0" />
      <Skeleton className="aspect-[3/1] w-full" />
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-3">
          <Skeleton className="h-5 w-full border-0" />
          <Skeleton className="h-5 w-full border-0" />
          <Skeleton className="h-5 w-11/12 border-0" />
          <Skeleton className="h-5 w-4/5 border-0" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  )
}

/** Numbered pagination with the brutalist square treatment. */
export function Pagination({ page, totalPages, onChange, className }) {
  if (!totalPages || totalPages <= 1) return null

  const pages = []
  const push = (value) => pages.push(value)
  const span = 1

  push(1)
  if (page - span > 2) push('…left')
  for (let i = Math.max(2, page - span); i <= Math.min(totalPages - 1, page + span); i += 1) push(i)
  if (page + span < totalPages - 1) push('…right')
  if (totalPages > 1) push(totalPages)

  return (
    <nav className={cn('flex flex-wrap items-center justify-center gap-2', className)} aria-label="Pagination">
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        aria-label="Previous page"
      >
        Prev
      </Button>
      {pages.map((entry, index) =>
        typeof entry === 'number' ? (
          <Button
            key={entry}
            variant={entry === page ? 'default' : 'outline'}
            size="sm"
            aria-current={entry === page ? 'page' : undefined}
            onClick={() => onChange(entry)}
            className="min-w-10"
          >
            {entry}
          </Button>
        ) : (
          <span key={`gap-${index}`} className="px-1 font-mono text-xs" aria-hidden>
            …
          </span>
        ),
      )}
      <Button
        variant="outline"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        aria-label="Next page"
      >
        Next
      </Button>
    </nav>
  )
}

/** Small stat tile: big number, tiny caption, hard border. */
export function StatTile({ value, label, hint, className, to }) {
  const Wrapper = to ? Link : 'div'
  return (
    <Wrapper
      {...(to ? { to } : {})}
      className={cn(
        'flex flex-col justify-between gap-2 border-[3px] border-black bg-white p-4 shadow-brutal transition-transform',
        to && 'hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-brutal-lg',
        className,
      )}
    >
      <span className="font-display text-3xl uppercase leading-none tracking-[-0.03em] sm:text-4xl">
        {value}
      </span>
      <span>
        <span className="brutal-kicker block">{label}</span>
        {hint ? <span className="mt-1 block text-[11px] leading-snug text-concrete">{hint}</span> : null}
      </span>
    </Wrapper>
  )
}

/** Label + value row used across detail pages and settings. */
export function DataRow({ label, value, className }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 border-b-2 border-ash py-2.5 last:border-b-0', className)}>
      <dt className="brutal-kicker shrink-0 pt-0.5 text-concrete">{label}</dt>
      <dd className="min-w-0 text-right font-mono text-xs font-bold uppercase tracking-[0.1em]">{value}</dd>
    </div>
  )
}