import * as React from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { CapabilityNotice, EmptyState, ErrorState, SectionHeader } from '@/components/feedback'
import { RevealFromBlack, Stagger, StaggerItem } from '@/components/motion'
import { useHackathonFacets } from '@/hooks/use-hackathons'
import { CATEGORY_LIST } from '@/lib/taxonomy-labels'

/**
 * All 14 categories with real counts.
 *
 * A category with a count of zero is still listed — it is honest about the
 * catalogue's actual shape and tells a visitor their filter will return nothing
 * rather than silently hiding the option.
 */
export default function CategoriesPage({ meta }) {
  const { facets, loading, error, reload } = useHackathonFacets()

  const counts = meta?.stats?.hackathons ?? 0
  const topTechnologies = React.useMemo(
    () =>
      (facets?.technologies ?? [])
        .filter((tech) => (tech.count ?? 0) > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 28),
    [facets],
  )

  const countByKey = React.useMemo(() => {
    const map = {}
    for (const category of facets?.categories ?? []) map[category.key] = category.count ?? 0
    return map
  }, [facets])

  const ordered = React.useMemo(
    () => CATEGORY_LIST.map((c) => ({ ...c, count: countByKey[c.key] ?? 0 })).sort((a, b) => b.count - a.count),
    [countByKey],
  )

  const max = ordered[0]?.count || 1

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6 sm:py-14">
      <SectionHeader
        kicker="Browse the catalogue"
        title="Fourteen directions"
        description="Each hackathon is mapped to exactly one primary category. Classification reads only what the organiser published — title, description, themes and tags — and falls back to Open innovation when nothing matches, rather than guessing."
      />

      {error ? (
        <ErrorState className="mt-8" title="Could not load category counts" error={error} onRetry={reload} />
      ) : null}

      <Stagger className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ordered.map((category, index) => (
          <StaggerItem key={category.key}>
            <Card className="group relative flex h-full flex-col overflow-hidden shadow-brutal">
              <RevealFromBlack>
                <Link
                  to={`/categories/${category.key}`}
                  className="flex h-full flex-col gap-3 p-5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-black"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="brutal-kicker text-concrete">{String(index + 1).padStart(2, '0')}</span>
                    {category.count === 0 ? (
                      <Badge variant="ash">No events yet</Badge>
                    ) : (
                      <Badge variant="solid">{category.count}</Badge>
                    )}
                  </span>

                  <span className="font-display text-2xl uppercase leading-[0.95] tracking-[-0.025em]">
                    {category.label}
                  </span>
                  <span className="text-sm leading-relaxed text-soot">{category.blurb}</span>

                  {/* Proportional bar — no gradient, just a hard block. */}
                  <span className="mt-auto block pt-4" aria-hidden>
                    <span className="block h-3 w-full border-2 border-black bg-white">
                      <span
                        className="block h-full bg-black"
                        style={{ width: `${Math.round((category.count / max) * 100)}%` }}
                      />
                    </span>
                  </span>

                  <span className="mt-2 inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
                    Explore
                    <ArrowUpRight className="size-3.5 stroke-[3] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </span>
                </Link>
              </RevealFromBlack>
            </Card>
          </StaggerItem>
        ))}
      </Stagger>

      {ordered.every((category) => category.count === 0) && !loading ? (
        <EmptyState
          className="mt-10"
          title="No categories populated yet"
          description="Run `npm run sync` to populate the catalogue, then reload this page."
        />
      ) : null}

      <section className="mt-20">
        <SectionHeader
          kicker="Most used"
          title="Technologies across the catalogue"
          description="Counted only where a source published a matching tag or an unambiguous mention in the event text. Empty means nobody claimed it, not that it is unsupported."
        />

        <Card className="mt-8 p-5 shadow-brutal">
          {topTechnologies.length === 0 ? (
            <p className="text-sm text-soot">No technology tags have been extracted yet.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {topTechnologies.map((tech) => (
                <li key={tech.label}>
                  <Link
                    to={`/explore?technology=${encodeURIComponent(tech.label)}`}
                    className="inline-flex items-center gap-2 border-2 border-black px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.12em] transition-colors hover:bg-black hover:text-white"
                  >
                    {tech.label}
                    <span className="bg-ash px-1.5 py-0.5 text-[10px] text-black">{tech.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <CapabilityNotice
        className="mt-12"
        title="About these counts"
        action={
          <Link
            to="/about"
            className="shrink-0 font-mono text-[11px] font-bold uppercase tracking-[0.14em] underline decoration-[3px] underline-offset-4 hover:no-underline"
          >
            Read the method
          </Link>
        }
      >
        Counts reflect the {counts.toLocaleString('en-US')} events currently stored. They change every time a
        sync runs, because organisers add and remove listings constantly. Nothing is padded or estimated.
      </CapabilityNotice>
    </div>
  )
}