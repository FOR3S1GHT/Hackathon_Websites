import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { LayoutGrid, List, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { HackathonCard } from '@/components/hackathon-card'
import { FilterBar, FilterSidebar, toApiQuery, useFilterState } from '@/components/filter-bar'
import {
  EmptyState,
  ErrorState,
  HackathonGridSkeleton,
  NoResults,
  Pagination,
  PageHeader,
} from '@/components/feedback'
import { FadeIn, Stagger, StaggerItem } from '@/components/motion'
import { useAuth } from '@/hooks/use-auth'
import { useHackathonFacets, useHackathons } from '@/hooks/use-hackathons'
import { useRealtime } from '@/hooks/use-realtime'
import { api } from '@/lib/api'
import { toast } from 'sonner'

/**
 * Explore.
 *
 * Filter state lives entirely in the URL (see components/filter-bar.jsx), and
 * the query object is derived from it, so what you can see is always
 * reproducible by copying the address bar.
 */
export default function ExplorePage() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const { state, update, clearAll, chips } = useFilterState()
  const { facets } = useHackathonFacets()
  const [view, setView] = React.useState('grid')

  // A finished sync can change the underlying data, so the query is rebuilt.
  const [syncNonce, setSyncNonce] = React.useState(0)
  useRealtime({ onCatalogueChanged: (_payload, type) => type === 'sync' && setSyncNonce((n) => n + 1) })

  // `toApiQuery` is a pure projection of the filter state, so the linter sees
  // `syncNonce` as unread. It is not: bumping the nonce returns a fresh object,
  // which is how the refetch after a completed sync is triggered.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const query = React.useMemo(() => toApiQuery(state), [state, syncNonce])
  const { items, pagination, loading, error, requestKey } = useHackathons(query, { pageSize: 24 })

  const [bookmarkedIds, setBookmarkedIds] = React.useState(() => new Set())
  const loadBookmarks = React.useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const result = await api.bookmarkIds()
      setBookmarkedIds(new Set(result?.ids ?? []))
    } catch {
      /* bookmarks are an enhancement; browsing must never depend on them */
    }
  }, [isAuthenticated])

  React.useEffect(() => {
    loadBookmarks()
  }, [loadBookmarks])

  const toggleBookmark = React.useCallback(
    async (hackathon) => {
      if (!isAuthenticated) {
        navigate('/login', { state: { from: `/explore?q=${encodeURIComponent(hackathon.title)}` } })
        toast('Sign in to bookmark hackathons.')
        return
      }
      const id = hackathon.id
      setBookmarkedIds((prev) => {
        const next = new Set(prev)
        const wasBookmarked = next.has(id)
        if (wasBookmarked) next.delete(id)
        else next.add(id)
        // Optimistic; reverted below if the request fails.
        ;(wasBookmarked ? api.removeBookmark(id) : api.addBookmark(id)).catch(() => {
          setBookmarkedIds((current) => {
            const reverted = new Set(current)
            if (wasBookmarked) reverted.add(id)
            else reverted.delete(id)
            return reverted
          })
          toast.error('Could not save that bookmark. Try again.')
        })
        return next
      })
    },
    [isAuthenticated, navigate],
  )

  // A finished sync can change the underlying data, so refresh the page.
  const hasFilters = chips.length > 0 || Boolean(state.q)

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader
        kicker="The full catalogue"
        title="Explore every hackathon"
        description="Search by name, organiser, technology, category, theme or location. Filter by status, format, dates, country and what is actually at stake. Everything below is a real listing from a source HackRadar reads."
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_290px] lg:items-start">
        <div className="min-w-0 space-y-6">
          <FilterBar facets={facets} total={pagination.total} />

          <div className="flex flex-wrap items-center justify-between gap-3 border-y-[3px] border-black py-3">
            <p className="font-mono text-xs uppercase tracking-[0.14em]" role="status" aria-live="polite">
              {loading
                ? 'Loading…'
                : `${pagination.total.toLocaleString('en-US')} result${pagination.total === 1 ? '' : 's'}`}
              {pagination.total > 0 && !loading ? (
                <span className="ml-2 text-concrete">
                  · page {pagination.page} of {Math.max(1, pagination.totalPages)}
                </span>
              ) : null}
            </p>

            <div className="flex items-center gap-2">
              {hasFilters ? (
                <Button variant="ghost" size="sm" onClick={clearAll}>
                  <RotateCw /> Clear filters
                </Button>
              ) : null}
              <div className="flex border-[3px] border-black" role="group" aria-label="Result layout">
                <button
                  type="button"
                  onClick={() => setView('grid')}
                  aria-pressed={view === 'grid'}
                  className={`px-3 py-2 transition-colors ${view === 'grid' ? 'bg-black text-white' : 'bg-white hover:bg-ash'}`}
                >
                  <LayoutGrid className="size-4 stroke-[2.5]" />
                  <span className="sr-only">Grid view</span>
                </button>
                <button
                  type="button"
                  onClick={() => setView('list')}
                  aria-pressed={view === 'list'}
                  className={`border-l-[3px] border-black px-3 py-2 transition-colors ${view === 'list' ? 'bg-black text-white' : 'bg-white hover:bg-ash'}`}
                >
                  <List className="size-4 stroke-[2.5]" />
                  <span className="sr-only">List view</span>
                </button>
              </div>
            </div>
          </div>

          <div key={requestKey} aria-busy={loading}>
            {error ? (
              <ErrorState title="Could not load the catalogue" error={error} onRetry={() => update({}, { keepPage: true })} />
            ) : loading ? (
              <HackathonGridSkeleton count={6} />
            ) : items.length === 0 ? (
              hasFilters ? (
                <NoResults query={state.q} onClear={clearAll} />
              ) : (
                <EmptyState
                  title="The catalogue is empty"
                  description="No hackathons have been stored yet. Run the sync once with `npm run sync` and reload."
                />
              )
            ) : view === 'grid' ? (
              <Stagger className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                {items.map((hackathon, index) => (
                  <StaggerItem key={hackathon.id}>
                    <HackathonCard
                      hackathon={hackathon}
                      // Only the first two banners are above the fold on a
                      // two-column grid; the rest stay lazy.
                      priority={index < 2}
                      isBookmarked={bookmarkedIds.has(hackathon.id)}
                      onToggleBookmark={toggleBookmark}
                    />
                  </StaggerItem>
                ))}
              </Stagger>
            ) : (
              <FadeIn>
                <Card className="divide-y-2 divide-ash p-0 shadow-brutal">
                  {items.map((hackathon, index) => (
                    <div key={hackathon.id} className="p-4">
                      <HackathonCard
                        hackathon={hackathon}
                        compact
                        priority={index < 2}
                        isBookmarked={bookmarkedIds.has(hackathon.id)}
                        onToggleBookmark={toggleBookmark}
                        className="[&>div]:border-0 [&>div]:shadow-none"
                      />
                    </div>
                  ))}
                </Card>
              </FadeIn>
            )}
          </div>

          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            onChange={(page) => {
              update({ page }, { keepPage: true })
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          />
        </div>

        <div className="hidden lg:block">
          <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto">
            <FilterSidebar facets={facets} />
          </div>
        </div>
      </div>
    </div>
  )
}