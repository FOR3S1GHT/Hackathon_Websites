import * as React from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { HackathonCard } from '@/components/hackathon-card'
import {
  EmptyState,
  ErrorState,
  HackathonGridSkeleton,
  PageHeader,
  Pagination,
} from '@/components/feedback'
import { Stagger, StaggerItem } from '@/components/motion'
import { useAuth } from '@/hooks/use-auth'
import { useHackathonFacets, useHackathons } from '@/hooks/use-hackathons'
import { api } from '@/lib/api'
import { CATEGORY_LIST } from '@/lib/taxonomy-labels'

/**
 * One category, listed.
 *
 * The URL is `/categories/<key>` — the same key used in the API's `category`
 * filter, so every link to this page is reproducible.
 */
export default function CategoryPage() {
  const { slug } = useParams()
  const { isAuthenticated } = useAuth()
  const { facets } = useHackathonFacets()
  const [page, setPage] = React.useState(1)

  const category = CATEGORY_LIST.find((c) => c.key === slug)
  const query = React.useMemo(
    () => ({ category: slug ?? undefined, page, sort: 'start-date' }),
    [slug, page],
  )
  const { items, pagination, loading, error, requestKey } = useHackathons(query, { pageSize: 12 })

  const siblings = React.useMemo(() => {
    const withCounts = new Map()
    for (const entry of facets?.categories ?? []) withCounts.set(entry.key, entry.count ?? 0)
    return CATEGORY_LIST.filter((c) => c.key !== slug)
      .map((c) => ({ ...c, count: withCounts.get(c.key) ?? 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
  }, [facets, slug])

  const [bookmarkedIds, setBookmarkedIds] = React.useState(() => new Set())
  React.useEffect(() => {
    if (!isAuthenticated) return
    api
      .bookmarkIds()
      .then((result) => setBookmarkedIds(new Set(result?.ids ?? [])))
      .catch(() => {})
  }, [isAuthenticated])

  if (!category) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 sm:px-6">
        <EmptyState
          title="Unknown category"
          description={`"${slug}" is not one of HackRadar's categories. It may have been renamed.`}
          action={
            <Button asChild variant="outline">
              <Link to="/categories">
                <ArrowLeft /> All categories
              </Link>
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6 sm:py-14">
      <Button asChild variant="ghost" size="sm" className="-ml-3">
        <Link to="/categories">
          <ArrowLeft /> All categories
        </Link>
      </Button>

      <PageHeader
        className="mt-4"
        kicker="Category"
        title={category.label}
        description={category.blurb}
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_260px] lg:items-start">
        <div className="min-w-0 space-y-6">
          <p className="border-y-[3px] border-black py-3 font-mono text-xs uppercase tracking-[0.14em]" role="status">
            {loading ? 'Loading…' : `${pagination.total.toLocaleString('en-US')} hackathons in ${category.label}`}
          </p>

          {error ? (
            <ErrorState title="Could not load this category" error={error} />
          ) : loading ? (
            <HackathonGridSkeleton count={6} />
          ) : items.length === 0 ? (
            <EmptyState
              title={`Nothing in ${category.label} yet`}
              description={`No hackathons in the catalogue are currently classified as ${category.label}. Classification only uses what organisers publish, so empty really does mean empty.`}
              action={
                <Button asChild variant="outline">
                  <Link to="/explore">
                    Browse everything <ArrowRight />
                  </Link>
                </Button>
              }
            />
          ) : (
            <Stagger key={requestKey} className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {items.map((hackathon, index) => (
                <StaggerItem key={hackathon.id}>
                  <HackathonCard
                    hackathon={hackathon}
                    priority={index < 2}
                    isBookmarked={bookmarkedIds.has(hackathon.id)}
                    onToggleBookmark={async (h) => {
                      if (!isAuthenticated) return
                      const next = new Set(bookmarkedIds)
                      if (next.has(h.id)) next.delete(h.id)
                      else next.add(h.id)
                      setBookmarkedIds(next)
                      try {
                        if (next.has(h.id)) await api.addBookmark(h.id)
                        else await api.removeBookmark(h.id)
                      } catch {
                        setBookmarkedIds(bookmarkedIds)
                      }
                    }}
                  />
                </StaggerItem>
              ))}
            </Stagger>
          )}

          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            onChange={(next) => {
              setPage(next)
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          />
        </div>

        <aside className="lg:sticky lg:top-24">
          <p className="brutal-kicker mb-3 border-b-[3px] border-black pb-2">Other categories</p>
          <ul className="flex flex-col">
            {siblings.map((entry) => (
              <li key={entry.key}>
                <Link
                  to={`/categories/${entry.key}`}
                  className="flex items-center justify-between gap-2 border-b-2 border-ash py-2.5 text-sm transition-colors hover:bg-ash"
                >
                  <span className="font-mono text-[11px] font-bold uppercase tracking-[0.1em]">{entry.label}</span>
                  <span className="font-mono text-[10px] text-concrete">{entry.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  )
}