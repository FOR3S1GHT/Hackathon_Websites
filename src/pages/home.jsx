import * as React from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  Database,
  Globe,
  RadioTower,
  Sparkles,
  Zap,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { HackathonCard } from '@/components/hackathon-card'
import {
  CapabilityNotice,
  EmptyState,
  ErrorState,
  HackathonGridSkeleton,
  SectionHeader,
  StatTile,
} from '@/components/feedback'
import { CountUp, FadeIn, Magnetic, Parallax, RevealFromBlack, Stagger, StaggerItem } from '@/components/motion'
import { useAuth } from '@/hooks/use-auth'
import { useHackathonFacets } from '@/hooks/use-hackathons'
import { useRealtime } from '@/hooks/use-realtime'
import { api } from '@/lib/api'
import { CATEGORY_LIST } from '@/lib/taxonomy-labels'
import { relativeTime } from '@/lib/format'

function useFeed(pick) {
  const [data, setData] = React.useState(null)
  const [error, setError] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    let active = true
    setLoading(true)
    Promise.resolve(pick())
      .then((result) => {
        if (active) {
          setData(result)
          setError(null)
        }
      })
      .catch((err) => {
        if (active) setError(err)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [pick, tick])

  return { data, error, loading, refresh: () => setTick((t) => t + 1) }
}

// Module-level constants, deliberately not useCallback: a hook cannot be called
// outside a component, and these never change.
const featuredFeed = () => api.featured()
const recentFeed = () => api.recent(9)

export default function HomePage({ meta }) {
  const { user } = useAuth()
  const { facets } = useHackathonFacets()
  const featured = useFeed(featuredFeed)
  const recent = useFeed(recentFeed)

  // When a sync finishes the server pushes an event; refresh the visible feeds so
  // the page genuinely updates without a reload.
  const [liveNotice, setLiveNotice] = React.useState(null)
  useRealtime({
    onCatalogueChanged: (payload, type) => {
      if (type === 'sync') {
        setLiveNotice(payload)
        featured.refresh()
        recent.refresh()
      }
      if (type === 'inserted') recent.refresh()
    },
  })

  React.useEffect(() => {
    if (!liveNotice) return undefined
    const timer = setTimeout(() => setLiveNotice(null), 12_000)
    return () => clearTimeout(timer)
  }, [liveNotice])

  const total = meta?.stats?.hackathons ?? 0
  const active = meta?.stats?.activeHackathons ?? 0
  const stats = meta?.stats ?? {}
  const countByKey = React.useMemo(() => {
    const map = {}
    for (const category of facets?.categories ?? []) map[category.key] = category.count ?? 0
    return map
  }, [facets])
  const topCategories = React.useMemo(
    () =>
      CATEGORY_LIST.map((category) => ({ ...category, count: countByKey[category.key] ?? 0 }))
        .filter((category) => category.count > 0)
        .sort((a, b) => b.count - a.count),
    [countByKey],
  )

  return (
    <>
      {/* ------------------------------------------------------------- hero -- */}
      <section className="relative overflow-hidden border-b-[3px] border-black">
        {/* Hard-edged grid, no gradients. */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #000 2px, transparent 2px), linear-gradient(to bottom, #000 2px, transparent 2px)',
            backgroundSize: '56px 56px',
          }}
          aria-hidden
        />

        <div className="relative mx-auto grid max-w-[1400px] gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.35fr_1fr] lg:items-end">
          <div>
            <FadeIn>
              <Badge variant="solid" className="mb-6">
                <RadioTower className="size-3" /> Live from official public APIs
              </Badge>
            </FadeIn>

            <h1 className="font-display text-[clamp(3rem,10vw,8.5rem)] uppercase leading-[0.82] tracking-[-0.045em]">
              <RevealFromBlack>Find your</RevealFromBlack>
              <RevealFromBlack delay={0.08}>next big</RevealFromBlack>
              <RevealFromBlack delay={0.16}>hack.</RevealFromBlack>
            </h1>

            <FadeIn delay={0.3} className="mt-8 max-w-xl">
              <p className="text-lg leading-relaxed text-soot sm:text-xl">
                {total.toLocaleString('en-US')} hackathons from {meta?.sources?.filter((s) => s.enabled).length ?? 0}{' '}
                official platforms, deduplicated and normalised into one catalogue. Every entry links back
                to the organiser&rsquo;s own listing — nothing is invented.
              </p>
            </FadeIn>

            <FadeIn delay={0.4}>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Magnetic>
                  <Button asChild size="lg">
                    <Link to="/explore">
                      Explore the catalogue <ArrowRight />
                    </Link>
                  </Button>
                </Magnetic>
                <Button asChild size="lg" variant="outline">
                  <Link to="/categories">Browse by category</Link>
                </Button>
                {!user ? (
                  <Button asChild size="lg" variant="ghost">
                    <Link to="/signup">Create a free account</Link>
                  </Button>
                ) : null}
              </div>
            </FadeIn>

            <FadeIn delay={0.5}>
              <p className="mt-6 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-concrete">
                <Database className="size-3.5 stroke-[3]" aria-hidden />
                {meta?.sync?.lastRefreshedAt ? (
                  <>
                    Catalogue last refreshed {relativeTime(meta.sync.lastRefreshedAt)} ·{' '}
                    {liveNotice ? 'just updated again' : 'polling every 30 minutes'}
                  </>
                ) : (
                  <>Waiting for the first sync run</>
                )}
              </p>
            </FadeIn>
          </div>

          <FadeIn delay={0.25} y={26}>
            <Card className="relative overflow-hidden shadow-brutal-xl">
              <div className="border-b-[3px] border-black bg-black px-5 py-3">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-white">
                  Live radar
                </p>
              </div>
              <div className="grid grid-cols-2">
                <div className="border-b-[3px] border-r-[3px] border-black p-5">
                  <CountUp value={total} className="block font-display text-4xl leading-none tracking-[-0.04em] sm:text-5xl" />
                  <p className="brutal-kicker mt-2">Hackathons indexed</p>
                </div>
                <div className="border-b-[3px] border-black p-5">
                  <CountUp value={active} className="block font-display text-4xl leading-none tracking-[-0.04em] sm:text-5xl" />
                  <p className="brutal-kicker mt-2">Upcoming or live</p>
                </div>
                <div className="border-r-[3px] border-black p-5">
                  <CountUp value={stats.bookmarks ?? 0} className="block font-display text-4xl leading-none tracking-[-0.04em] sm:text-5xl" />
                  <p className="brutal-kicker mt-2">Bookmarks saved</p>
                </div>
                <div className="p-5">
                  <span className="block font-display text-4xl leading-none tracking-[-0.04em] sm:text-5xl">
                    {meta?.store === 'supabase' ? 'PG' : 'JSON'}
                  </span>
                  <p className="brutal-kicker mt-2">Datastore driver</p>
                </div>
              </div>
              <div className="border-t-[3px] border-black bg-ash px-5 py-3">
                <p className="font-mono text-[10px] uppercase leading-relaxed tracking-[0.12em] text-soot">
                  New listings appear within one polling interval of the organiser publishing them.
                  HackRadar is not an instant mirror and does not claim to be.
                </p>
              </div>
            </Card>
          </FadeIn>
        </div>
      </section>

      {liveNotice ? (
        <div className="mx-auto max-w-[1400px] px-4 pt-8 sm:px-6">
          <CapabilityNotice title="Catalogue just updated">
            A sync run finished ({liveNotice.discovered ?? 0} discovered, {liveNotice.inserted ?? 0} new). The
            lists below have already been refreshed — no reload needed.
          </CapabilityNotice>
        </div>
      ) : null}

      {/* -------------------------------------------------------- featured -- */}
      <section className="mx-auto max-w-[1400px] px-4 py-16 sm:px-6">
        <SectionHeader
          kicker="Featured now"
          title="Worth your weekend"
          description="Hackathons that are live or opening soon, ranked by how much is actually at stake and how soon you need to decide."
          action={
            <Button asChild variant="outline">
              <Link to="/explore?status=ongoing">
                See everything live <ArrowRight />
              </Link>
            </Button>
          }
        />

        <div className="mt-8">
          {featured.loading ? (
            <HackathonGridSkeleton count={3} />
          ) : featured.error ? (
            <ErrorState title="Could not load featured hackathons" error={featured.error} onRetry={featured.refresh} />
          ) : (featured.data?.items ?? []).length === 0 ? (
            <EmptyState
              title="Nothing featured right now"
              description="No hackathon is currently live or opening soon in the catalogue. The most recently discovered events are below."
              action={<Button asChild variant="outline"><Link to="/explore">Browse the catalogue</Link></Button>}
            />
          ) : (
            <Stagger className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {featured.data.items.slice(0, 6).map((hackathon) => (
                <StaggerItem key={hackathon.id}>
                  <HackathonCard hackathon={hackathon} />
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </div>
      </section>

      {/* --------------------------------------------------------- marquee -- */}
      <Parallax distance={18} className="overflow-hidden border-y-[3px] border-black bg-black py-4">
        <div className="flex min-w-max items-center gap-8 whitespace-nowrap">
          {Array.from({ length: 2 }).map((_, copy) => (
            <React.Fragment key={copy}>
              {['NO SIGN-UP WALL', 'REAL DEADLINES', 'ONE SCHEMA', 'OPEN SOURCE FEEDS', 'NO INVENTED DATA'].map(
                (phrase) => (
                  <span key={`${copy}-${phrase}`} className="flex items-center gap-8 font-display text-2xl uppercase tracking-[-0.02em] text-white sm:text-3xl">
                    {phrase}
                    <Zap className="size-5 stroke-[3] text-white" />
                  </span>
                ),
              )}
            </React.Fragment>
          ))}
        </div>
      </Parallax>

      {/* ------------------------------------------------------- categories -- */}
      <section className="mx-auto max-w-[1400px] px-4 py-16 sm:px-6">
        <SectionHeader
          kicker="14 categories"
          title="Pick a direction"
          description="Every event is mapped to exactly one primary category from its published description, themes and tags. Counts are live."
          action={
            <Button asChild variant="outline">
              <Link to="/categories">All categories <ArrowRight /></Link>
            </Button>
          }
        />

        <Stagger className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {topCategories.map((category, index) => (
            <StaggerItem key={category.key}>
              <Link
                to={`/categories/${category.key}`}
                className="group flex h-full flex-col justify-between gap-4 border-[3px] border-black bg-white p-4 transition-transform hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-brutal"
              >
                <span className="brutal-kicker text-concrete">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span>
                  <span className="block font-display text-lg uppercase leading-[1.05] tracking-[-0.02em] group-hover:underline group-hover:decoration-[3px] group-hover:underline-offset-4">
                    {category.label}
                  </span>
                  <span className="mt-2 block font-mono text-[11px] uppercase tracking-[0.12em] text-concrete">
                    {category.count} events
                  </span>
                </span>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* ---------------------------------------------------------- recent -- */}
      <section className="border-y-[3px] border-black bg-ash py-16">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6">
          <SectionHeader
            kicker="Recently added"
            title="Fresh on the radar"
            description="These were discovered by HackRadar in the last two weeks. The date shown is when we found them, not when the organiser published them."
            action={
              <Button asChild variant="outline">
                <Link to="/explore?status=newly-added">
                  See all new <ArrowRight />
                </Link>
              </Button>
            }
          />

          <div className="mt-8">
            {recent.loading ? (
              <HackathonGridSkeleton count={6} />
            ) : recent.error ? (
              <ErrorState title="Could not load recent additions" error={recent.error} onRetry={recent.refresh} />
            ) : (recent.data?.items ?? []).length === 0 ? (
              <EmptyState
                title="No new additions in the last two weeks"
                description="The catalogue is current but nothing new has been published since the last sync. New events usually appear within a day or two of being announced."
              />
            ) : (
              <Stagger className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {recent.data.items.map((hackathon) => (
                  <StaggerItem key={hackathon.id}>
                    <HackathonCard hackathon={hackathon} />
                  </StaggerItem>
                ))}
              </Stagger>
            )}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- how it works */}
      <section className="mx-auto max-w-[1400px] px-4 py-16 sm:px-6">
        <SectionHeader kicker="No magic" title="How HackRadar stays honest" />

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          <Card className="flex flex-col gap-3 p-5 shadow-brutal">
            <Globe className="size-7 stroke-[2.5]" aria-hidden />
            <h3 className="font-display text-xl uppercase leading-none tracking-[-0.02em]">Public APIs only</h3>
            <p className="text-sm leading-relaxed text-soot">
              Every record comes from a source that publishes a machine-readable API or feed and permits
              automated access. Nothing bypasses a login, CAPTCHA or paywall.
            </p>
            <Link
              to="/data-sources"
              className="mt-auto inline-flex items-center gap-1 self-start font-mono text-[11px] font-bold uppercase tracking-[0.14em] underline decoration-[3px] underline-offset-4 hover:no-underline"
            >
              See every source <ArrowUpRight className="size-3.5 stroke-[3]" />
            </Link>
          </Card>

          <Card className="flex flex-col gap-3 p-5 shadow-brutal">
            <RadioTower className="size-7 stroke-[2.5]" aria-hidden />
            <h3 className="font-display text-xl uppercase leading-none tracking-[-0.02em]">Scheduled, not scraped</h3>
            <p className="text-sm leading-relaxed text-soot">
              A scheduler re-reads each source on an interval with retries and backoff. Failures are recorded
              per source and surfaced rather than silently swallowed.
            </p>
            <Link
              to="/data-sources"
              className="mt-auto inline-flex items-center gap-1 self-start font-mono text-[11px] font-bold uppercase tracking-[0.14em] underline decoration-[3px] underline-offset-4 hover:no-underline"
            >
              View run history <ArrowUpRight className="size-3.5 stroke-[3]" />
            </Link>
          </Card>

          <Card className="flex flex-col gap-3 p-5 shadow-brutal">
            <Sparkles className="size-7 stroke-[2.5]" aria-hidden />
            <h3 className="font-display text-xl uppercase leading-none tracking-[-0.02em]">Deduplicated properly</h3>
            <p className="text-sm leading-relaxed text-soot">
              The same event listed on two platforms is merged into one entry. Which copy wins is decided
              deterministically, and every card still links to the original listing.
            </p>
            <Link
              to="/about"
              className="mt-auto inline-flex items-center gap-1 self-start font-mono text-[11px] font-bold uppercase tracking-[0.14em] underline decoration-[3px] underline-offset-4 hover:no-underline"
            >
              How classification works <ArrowUpRight className="size-3.5 stroke-[3]" />
            </Link>
          </Card>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile value={total.toLocaleString('en-US')} label="Hackathons" hint="Deduplicated events" />
          <StatTile
            value={(meta?.sources ?? []).filter((s) => s.enabled).length}
            label="Live sources"
            hint="Official public APIs"
          />
          <StatTile
            value={(meta?.unavailableSources ?? []).length}
            label="Documented gaps"
            hint="Sources we explain but do not scrape"
          />
          <StatTile value={CATEGORY_LIST.length} label="Categories" hint="Coarse buckets, one per event" />
        </div>
      </section>
    </>
  )
}