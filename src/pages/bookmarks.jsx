import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Bookmark, CalendarClock, Lightbulb, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { HackathonCard } from '@/components/hackathon-card'
import {
  CapabilityNotice,
  EmptyState,
  ErrorState,
  HackathonGridSkeleton,
  PageHeader,
} from '@/components/feedback'
import { Stagger, StaggerItem } from '@/components/motion'
import { useAuth } from '@/hooks/use-auth'
import { api } from '@/lib/api'
import { DIFFICULTY_LABEL, countdown, formatDateRange } from '@/lib/taxonomy-labels'
import { copyToClipboard, ideaToText } from '@/components/idea-generator'

/**
 * Bookmarks.
 *
 * Grouped by status because the useful question is never "what did I save" but
 * "what did I save that I still need to act on".
 */
export default function BookmarksPage() {
  const { isAuthenticated, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(null)
  const [busyId, setBusyId] = React.useState(null)
  const [view, setView] = React.useState('upcoming')

  const load = React.useCallback(async () => {
    if (!isAuthenticated) {
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const data = await api.bookmarks()
      setItems(data?.items ?? [])
      setError(null)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  React.useEffect(() => {
    load()
  }, [load])

  const remove = async (hackathon) => {
    setBusyId(hackathon.id)
    setItems((prev) => prev.filter((i) => i.id !== hackathon.id))
    try {
      await api.removeBookmark(hackathon.id)
      toast('Removed from bookmarks.')
    } catch {
      toast.error('Could not remove that bookmark. Restoring it.')
      load()
    } finally {
      setBusyId(null)
    }
  }

  const groups = React.useMemo(() => {
    const bucket = { upcoming: [], ongoing: [], completed: [] }
    for (const item of items) {
      const status = item.derivedStatus
      if (status === 'ongoing') bucket.ongoing.push(item)
      else if (status === 'upcoming') bucket.upcoming.push(item)
      else bucket.completed.push(item)
    }
    // Inside "upcoming", the ones with the nearest registration deadline first.
    bucket.upcoming.sort((a, b) => {
      const av = a.registrationDeadline ? new Date(a.registrationDeadline).getTime() : Infinity
      const bv = b.registrationDeadline ? new Date(b.registrationDeadline).getTime() : Infinity
      return av - bv
    })
    return bucket
  }, [items])

  if (!authLoading && !isAuthenticated) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 sm:px-6">
        <EmptyState
          icon={Bookmark}
          title="Sign in to see your bookmarks"
          description="Bookmarks live in your account so they follow you across devices. You do not need an account to browse anything else on HackRadar."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Button onClick={() => navigate('/login', { state: { from: '/bookmarks' } })}>Sign in</Button>
              <Button asChild variant="outline">
                <Link to="/signup">Create a free account</Link>
              </Button>
            </div>
          }
        />
      </div>
    )
  }

  const viewItems = groups[view] ?? []

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader
        kicker="Saved"
        title="Your bookmarks"
        description="Everything you have saved, grouped by whether it still needs a decision from you."
        action={
          items.length ? (
            <Button asChild variant="outline">
              <Link to="/explore">
                Find more <ArrowRight />
              </Link>
            </Button>
          ) : null
        }
      />

      {error ? <ErrorState className="mt-8" title="Could not load your bookmarks" error={error} onRetry={load} /> : null}

      {loading ? (
        <div className="mt-8">
          <HackathonGridSkeleton count={3} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={Bookmark}
          title="Nothing saved yet"
          description="Bookmark anything in the catalogue and it will show up here with its registration deadline, so you never miss the window."
          action={
            <Button asChild>
              <Link to="/explore">
                Explore hackathons <ArrowRight />
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="mt-8 grid grid-cols-3 border-[3px] border-black">
            {[
              { key: 'upcoming', label: 'Upcoming', count: groups.upcoming.length },
              { key: 'ongoing', label: 'Live now', count: groups.ongoing.length },
              { key: 'completed', label: 'Completed', count: groups.completed.length },
            ].map((tab, index) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setView(tab.key)}
                aria-pressed={view === tab.key}
                className={`px-4 py-4 text-left transition-colors ${
                  index > 0 ? 'border-l-[3px] border-black' : ''
                } ${view === tab.key ? 'bg-black text-white' : 'bg-white hover:bg-ash'}`}
              >
                <span className="block font-display text-2xl uppercase leading-none tracking-[-0.03em]">
                  {tab.count}
                </span>
                <span className="mt-1.5 block font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
                  {tab.label}
                </span>
              </button>
            ))}
          </div>

          {viewItems.length === 0 ? (
            <EmptyState
              className="mt-6"
              title={`Nothing ${view === 'upcoming' ? 'upcoming' : view === 'ongoing' ? 'live right now' : 'completed'}`}
              description="Switch tabs to see the rest of your saved hackathons."
            />
          ) : (
            <Stagger className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {viewItems.map((hackathon) => (
                <StaggerItem key={hackathon.id} className="relative">
                  <HackathonCard hackathon={hackathon} isBookmarked onToggleBookmark={remove} />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => remove(hackathon)}
                    disabled={busyId === hackathon.id}
                    className="absolute -top-3 right-3 z-20 bg-white"
                  >
                    <Trash2 /> Remove
                  </Button>
                </StaggerItem>
              ))}
            </Stagger>
          )}

          <CapabilityNotice className="mt-10" title="Deadlines are as published, not as estimated">
            Registration deadlines come straight from the source. They change, and some organisers never
            publish one — check the official listing before you rely on a date.
          </CapabilityNotice>
        </>
      )}
    </div>
  )
}

/** Saved project ideas, reused by the dashboard. */
export function SavedIdeasPanel({ ideas, onDelete, className }) {
  if (!ideas?.length) {
    return (
      <EmptyState
        className={className}
        icon={Lightbulb}
        title="No saved ideas yet"
        description="Generate ideas for any hackathon and press Save to keep them here."
        action={
          <Button asChild variant="outline">
            <Link to="/ideas">Generate ideas <ArrowRight /></Link>
          </Button>
        }
      />
    )
  }

  return (
    <div className={className}>
      <ul className="grid gap-3 sm:grid-cols-2">
        {ideas.map((idea) => (
          <Card key={idea.id} className="flex flex-col p-4 shadow-brutal">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-display text-base uppercase leading-tight tracking-[-0.02em]">{idea.title}</h3>
              <Badge variant={idea.source === 'ai' ? 'solid' : 'outline'}>
                {idea.source === 'ai' ? 'AI' : 'Rules'}
              </Badge>
            </div>
            {idea.hackathonTitle ? (
              <Link
                to={`/hackathon/${idea.hackathonSlug ?? ''}`}
                className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-concrete underline decoration-[2px] underline-offset-4 hover:text-black"
              >
                {idea.hackathonTitle}
              </Link>
            ) : null}
            <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-soot">{idea.description ?? idea.problem}</p>
            <p className="mt-auto flex flex-wrap items-center gap-2 pt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-concrete">
              <span>{DIFFICULTY_LABEL[idea.difficulty] ?? idea.difficulty}</span>
              {idea.estimatedTime ? <span>· {idea.estimatedTime}</span> : null}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 border-t-2 border-ash pt-3">
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const ok = await copyToClipboard(
                    ideaToText(
                      {
                        title: idea.title,
                        summary: idea.description,
                        problem: idea.problem,
                        targetUsers: idea.targetUsers,
                        difficulty: idea.difficulty,
                        technologies: idea.technologies ?? [],
                        keyFeatures: idea.keyFeatures ?? [],
                        implementationSteps: idea.implementationSteps ?? [],
                        estimatedTime: idea.estimatedTime,
                        demoTips: idea.demoTips ?? [],
                      },
                      { hackathonTitle: idea.hackathonTitle },
                    ),
                  )
                  if (ok) toast.success('Copied as plain text.')
                  else toast.error('Could not copy.')
                }}
              >
                Copy
              </Button>
              {onDelete ? (
                <Button size="sm" variant="ghost" onClick={() => onDelete(idea)}>
                  <Trash2 /> Delete
                </Button>
              ) : null}
            </div>
          </Card>
        ))}
      </ul>
    </div>
  )
}

/** Deadline rollup used by the dashboard. */
export function DeadlineList({ items, emptyText = 'No upcoming deadlines.' }) {
  if (!items?.length) {
    return (
      <p className="border-[3px] border-dashed border-black px-4 py-6 text-center text-sm text-soot">{emptyText}</p>
    )
  }
  return (
    <ul className="flex flex-col">
      {items.map((item) => {
        const remaining = countdown(item.registrationDeadline)
        return (
          <li key={item.id} className="border-b-2 border-ash last:border-b-0">
            <Link to={`/hackathon/${item.slug}`} className="flex items-center justify-between gap-3 py-3 hover:bg-ash">
              <span className="min-w-0">
                <span className="block truncate font-mono text-xs font-bold uppercase tracking-[0.1em]">
                  {item.title}
                </span>
                <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.12em] text-concrete">
                  {formatDateRange(item.startDate, item.endDate) ?? 'Dates not published'}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 border-2 border-black px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em]">
                <CalendarClock className="size-3 stroke-[3]" aria-hidden />
                {remaining ?? 'No deadline'}
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}