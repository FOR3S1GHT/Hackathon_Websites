import * as React from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  CalendarDays,
  Globe,
  MapPin,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Pressable } from '@/components/motion'
import { cn } from '@/lib/utils'
import {
  CATEGORY_LABEL,
  formatDateRange,
  formatMoney,
  countdown,
  relativeTime,
  STATUS_LABEL,
} from '@/lib/taxonomy-labels'

/** New = discovered by HackRadar in the last few days. Mirrors the server window. */
export const NEW_WINDOW_DAYS = 14

export function isRecentlyDiscovered(hackathon, reference = new Date()) {
  if (!hackathon?.firstDiscoveredAt) return false
  const found = new Date(hackathon.firstDiscoveredAt)
  if (Number.isNaN(found.getTime())) return false
  const days = (reference.getTime() - found.getTime()) / 86_400_000
  return days >= 0 && days <= NEW_WINDOW_DAYS
}

/**
 * Banner image.
 *
 * Only the source's own published banner is ever rendered, lazy-loaded with a
 * fixed aspect ratio so the grid never reflows, and replaced by a typographic
 * placeholder if the image 404s. Nothing is hotlinked from a third party.
 */
function Banner({ hackathon, className, priority = false }) {
  const [failed, setFailed] = React.useState(false)
  const src = hackathon.bannerUrl

  if (!src || failed) {
    return (
      <div
        className={cn(
          'flex items-end bg-ash p-4',
          'bg-[linear-gradient(0deg,#E5E5E5_0%,#E5E5E5_100%)]',
          className,
        )}
        aria-hidden
      >
        <span className="brutal-kicker line-clamp-2 text-concrete">
          {hackathon.sourceName === 'kaggle' ? 'No banner published' : 'No banner published by the organiser'}
        </span>
      </div>
    )
  }

  return (
    <div className={cn('overflow-hidden bg-ash', className)}>
      <img
        src={src}
        alt={`Banner for ${hackathon.title}`}
        // Banners are lazy by default so a long list does not fetch 40 images.
        // The first row of a grid is `priority`, because it is above the fold and
        // is the page's Largest Contentful Paint.
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
        width={640}
        height={256}
        onError={() => setFailed(true)}
        className="size-full object-cover"
      />
    </div>
  )
}

function StatusBadge({ status }) {
  if (status === 'ongoing') return <Badge variant="solid">Live now</Badge>
  if (status === 'upcoming') return <Badge variant="outline">Upcoming</Badge>
  return <Badge variant="ash">Completed</Badge>
}

/**
 * The catalogue card.
 *
 * Deliberately shows the two dates that are easy to confuse:
 *  - the event's own dates (start → end), and
 *  - when HackRadar discovered it ("New · 2d ago").
 */
export function HackathonCard({
  hackathon,
  className,
  isBookmarked = false,
  onToggleBookmark,
  compact = false,
  priority = false,
}) {
  if (!hackathon) return null

  const isNew = isRecentlyDiscovered(hackathon)
  const dates = formatDateRange(hackathon.startDate, hackathon.endDate)
  const prize = formatMoney(hackathon.prizePool, hackathon.currency)
  const registration = countdown(hackathon.registrationDeadline)
  const categoryLabel = CATEGORY_LABEL[hackathon.category] ?? 'Open innovation'

  const deadlineUrgent =
    typeof hackathon.daysToRegistrationDeadline === 'number' &&
    hackathon.daysToRegistrationDeadline >= 0 &&
    hackathon.daysToRegistrationDeadline <= 7

  return (
    <Pressable className={cn('h-full', className)} scale={0.99}>
      <Card className="flex h-full flex-col overflow-hidden shadow-brutal-lg">
        <Link
          to={`/hackathon/${hackathon.slug}`}
          className="group relative block focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-black focus-visible:ring-offset-0"
        >
          <div className="relative aspect-[5/2] border-b-[3px] border-black">
            <Banner hackathon={hackathon} priority={priority} className="absolute inset-0 size-full" />
            <div className="absolute left-0 top-0 flex flex-wrap gap-1.5 p-3">
              <StatusBadge status={hackathon.derivedStatus} />
              {isNew ? (
                <Badge variant="solid" className="bg-white text-black">
                  <Sparkles className="size-3" /> New
                </Badge>
              ) : null}
              {hackathon.beginnerFriendly ? <Badge variant="invert">Beginner friendly</Badge> : null}
            </div>
          </div>
        </Link>

        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="brutal-kicker text-concrete">{hackathon.organizer ?? hackathon.sourceName}</p>
              <h3 className="mt-1.5 font-display text-lg uppercase leading-[1.05] tracking-[-0.02em]">
                <Link to={`/hackathon/${hackathon.slug}`} className="hover:underline decoration-[3px] underline-offset-4">
                  {hackathon.title}
                </Link>
              </h3>
            </div>
            {onToggleBookmark ? (
              <button
                type="button"
                onClick={() => onToggleBookmark(hackathon)}
                aria-pressed={isBookmarked}
                aria-label={isBookmarked ? `Remove ${hackathon.title} from bookmarks` : `Bookmark ${hackathon.title}`}
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center border-[3px] border-black transition-colors',
                  isBookmarked ? 'bg-black text-white' : 'bg-white text-black hover:bg-black hover:text-white',
                )}
              >
                {isBookmarked ? <BookmarkCheck className="size-4 stroke-[2.5]" /> : <Bookmark className="size-4 stroke-[2.5]" />}
              </button>
            ) : null}
          </div>

          {!compact && hackathon.summary ? (
            <p className="line-clamp-3 text-sm leading-relaxed text-soot">{hackathon.summary}</p>
          ) : null}

          <div className="flex flex-wrap gap-1.5">
            <Badge variant="ash">{categoryLabel}</Badge>
            {hackathon.eventFormat ? (
              <Badge variant="outline" className="gap-1">
                {hackathon.eventFormat === 'online' ? <Globe /> : <MapPin />}
                {hackathon.eventFormat === 'online'
                  ? 'Online'
                  : hackathon.eventFormat === 'hybrid'
                    ? 'Hybrid'
                    : hackathon.eventFormat === 'offline'
                      ? 'In person'
                      : 'Format n/a'}
              </Badge>
            ) : null}
            {prize ? (
              <Badge variant="outline" className="gap-1">
                <Trophy />
                {prize}
              </Badge>
            ) : null}
          </div>

          <dl className="mt-auto grid gap-1.5 border-t-2 border-ash pt-3 font-mono text-[11px] uppercase tracking-[0.1em] text-soot">
            <div className="flex items-center gap-2">
              <CalendarDays className="size-3.5 shrink-0 stroke-[3]" />
              <dt className="sr-only">Event dates</dt>
              <dd>{dates ?? 'Dates not published'}</dd>
            </div>
            {registration ? (
              <div className="flex items-center gap-2">
                <Users className="size-3.5 shrink-0 stroke-[3]" />
                <dt className="sr-only">Registration deadline</dt>
                <dd className={deadlineUrgent ? 'font-black text-black' : ''}>
                  Register {registration}
                  {deadlineUrgent ? ' · closing soon' : ''}
                </dd>
              </div>
            ) : null}
            {isNew ? (
              <div className="flex items-center gap-2 text-black">
                <Sparkles className="size-3.5 shrink-0 stroke-[3]" />
                <dt className="sr-only">Discovered by HackRadar</dt>
                <dd className="font-bold">Discovered {relativeTime(hackathon.firstDiscoveredAt)}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div className="flex items-center justify-between border-t-[3px] border-black px-4 py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-concrete">
            via {hackathon.sourceName}
          </span>
          <Link
            to={`/hackathon/${hackathon.slug}`}
            className="inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] underline decoration-[3px] underline-offset-4 hover:no-underline"
          >
            Details <ArrowUpRight className="size-3 stroke-[3]" />
          </Link>
        </div>
      </Card>
    </Pressable>
  )
}

/** One-line row used in sidebars, compare trays and the dashboard. */
export function HackathonRow({ hackathon, right, className, to }) {
  return (
    <Link
      to={to ?? `/hackathon/${hackathon.slug}`}
      className={cn(
        'flex items-center justify-between gap-3 border-b-2 border-ash py-3 transition-colors hover:bg-ash',
        className,
      )}
    >
      <span className="min-w-0">
        <span className="block truncate font-mono text-xs font-bold uppercase tracking-[0.1em]">
          {hackathon.title}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-concrete">
          {hackathon.organizer ?? hackathon.sourceName} ·{' '}
          {formatDateRange(hackathon.startDate, hackathon.endDate) ?? 'dates n/a'}
        </span>
      </span>
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-concrete">
        {right ?? STATUS_LABEL[hackathon.derivedStatus]}
      </span>
    </Link>
  )
}

export default HackathonCard