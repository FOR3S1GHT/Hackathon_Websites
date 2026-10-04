import * as React from 'react'
import { Link } from 'react-router-dom'
import { Lightbulb, Search, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { CapabilityNotice, EmptyState, ErrorState, HackathonGridSkeleton, PageHeader } from '@/components/feedback'
import { IdeaGenerator } from '@/components/idea-generator'
import { Stagger, StaggerItem } from '@/components/motion'
import { HackathonRow } from '@/components/hackathon-card'
import { useHackathons } from '@/hooks/use-hackathons'
import { CATEGORY_LIST } from '@/lib/taxonomy-labels'

/**
 * Standalone project-idea generator.
 *
 * The first step is always "pick a hackathon", because every suggestion is
 * derived from one specific event's published themes. Generating for a
 * hypothetical event would be exactly the kind of invention HackRadar avoids.
 */
export default function IdeasPage() {
  const [picked, setPicked] = React.useState(null)
  const [search, setSearch] = React.useState('')
  const [debounced, setDebounced] = React.useState('')
  const [category, setCategory] = React.useState('')

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 280)
    return () => clearTimeout(timer)
  }, [search])

  // Only search once the visitor has typed something, so the default view is a
  // helpful shortlist rather than an arbitrary alphabetical slice.
  const query = React.useMemo(
    () =>
      debounced.trim().length >= 2
        ? { q: debounced.trim(), status: 'ongoing,upcoming', pageSize: 12 }
        : { status: 'ongoing', sort: 'recently-discovered', pageSize: 12 },
    [debounced],
  )
  const { items, loading, error } = useHackathons(query, { pageSize: 12 })

  const filtered = React.useMemo(
    () => (category ? items.filter((h) => h.category === category) : items),
    [items, category],
  )

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader
        kicker="Project ideas"
        title="Never arrive with nothing"
        description="Pick a hackathon and HackRadar will turn its own published themes, tracks and technologies into concrete build ideas — with the problem, the users, a stack, build steps and demo tips."
      />

      <CapabilityNotice className="mt-8" title="These are suggestions, not promises">
        Ideas are derived from what the organiser published. HackRadar cannot know the private judging
        criteria, the sponsors&rsquo; priorities or what else is being built. Nothing here guarantees
        selection, a prize, or that a suggestion is even accepted as a valid entry — read the official brief.
      </CapabilityNotice>

      {picked ? (
        <div className="mt-8">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em]">
              Generating for{' '}
              <Link
                to={`/hackathon/${picked.slug}`}
                className="font-bold underline decoration-[3px] underline-offset-4"
              >
                {picked.title}
              </Link>
            </p>
            <Button variant="ghost" onClick={() => setPicked(null)}>
              Choose a different hackathon
            </Button>
          </div>
          <IdeaGenerator hackathon={picked} showHeading={false} />
        </div>
      ) : (
        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_320px] lg:items-start">
          <div className="min-w-0">
            <Card className="p-4 shadow-brutal">
              <form
                role="search"
                onSubmit={(event) => {
                  event.preventDefault()
                  setDebounced(search)
                }}
                className="relative"
              >
                <Label htmlFor="idea-hackathon-search" className="brutal-kicker">
                  Step 1 — find the hackathon
                </Label>
                <Search
                  className="pointer-events-none absolute bottom-3 left-3 size-4 -translate-y-1/2 stroke-[3]"
                  aria-hidden
                />
                <Input
                  id="idea-hackathon-search"
                  type="search"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value)
                    if (event.target.value.length < 2) setDebounced('')
                  }}
                  placeholder="Search hackathons by name, organiser or technology…"
                  className="mt-2 pl-10"
                />
              </form>

              <div className="mt-4 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setCategory('')}
                  aria-pressed={category === ''}
                  className={`border-2 border-black px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] ${
                    category === '' ? 'bg-black text-white' : 'bg-white hover:bg-ash'
                  }`}
                >
                  All
                </button>
                {CATEGORY_LIST.slice(0, 8).map((entry) => (
                  <button
                    key={entry.key}
                    type="button"
                    onClick={() => setCategory(entry.key)}
                    aria-pressed={category === entry.key}
                    className={`border-2 border-black px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] ${
                      category === entry.key ? 'bg-black text-white' : 'bg-white hover:bg-ash'
                    }`}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
            </Card>

            <div className="mt-5">
              {error ? (
                <ErrorState title="Could not load hackathons" error={error} />
              ) : loading ? (
                <HackathonGridSkeleton count={3} />
              ) : filtered.length === 0 ? (
                <EmptyState
                  icon={Search}
                  title="No hackathons matched"
                  description="Try a broader search term, or clear the category filter."
                  action={
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSearch('')
                        setDebounced('')
                        setCategory('')
                      }}
                    >
                      Reset the search
                    </Button>
                  }
                />
              ) : (
                <Stagger className="border-[3px] border-black bg-white shadow-brutal">
                  {filtered.map((hackathon) => (
                    <StaggerItem key={hackathon.id} className="border-b-2 border-ash last:border-b-0">
                      <div className="flex items-center justify-between gap-3 px-4 py-1">
                        <HackathonRow hackathon={hackathon} to={`/hackathon/${hackathon.slug}`} />
                        <Button size="sm" onClick={() => setPicked(hackathon)}>
                          <Lightbulb /> Ideas
                        </Button>
                      </div>
                    </StaggerItem>
                  ))}
                </Stagger>
              )}
            </div>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24">
            <Card className="p-5 shadow-brutal">
              <p className="brutal-kicker flex items-center gap-1.5">
                <ShieldAlert className="size-3.5 stroke-[3]" aria-hidden /> How these are built
              </p>
              <ol className="mt-4 space-y-3 font-mono text-[11px] uppercase leading-relaxed tracking-[0.1em] text-soot">
                <li>
                  <span className="font-bold text-black">01</span> Read the event's published themes, tracks,
                  description and technology tags.
                </li>
                <li>
                  <span className="font-bold text-black">02</span> Derive its difficulty signals — only from
                  what is stated, never guessed.
                </li>
                <li>
                  <span className="font-bold text-black">03</span> Fill a deterministic template pool with
                  those signals.
                </li>
                <li>
                  <span className="font-bold text-black">04</span> Optionally ask a configured AI provider
                  for a draft, then label it clearly as AI output.
                </li>
              </ol>
              <Link
                to="/about"
                className="mt-4 inline-block font-mono text-[10px] font-bold uppercase tracking-[0.14em] underline decoration-[3px] underline-offset-4 hover:no-underline"
              >
                Read the full method
              </Link>
            </Card>
          </aside>
        </div>
      )}
    </div>
  )
}