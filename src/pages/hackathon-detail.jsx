import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  CalendarDays,
  Clock,
  ExternalLink,
  Globe,
  HelpCircle,
  RadioTower,
  Scale,
  ScrollText,
  Trophy,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { HackathonCard } from '@/components/hackathon-card'
import {
  CapabilityNotice,
  DataRow,
  DetailSkeleton,
  EmptyState,
  ErrorState,
  SectionHeader,
} from '@/components/feedback'
import { Stagger, StaggerItem } from '@/components/motion'
import { useAuth } from '@/hooks/use-auth'
import { useHackathon } from '@/hooks/use-hackathons'
import { api } from '@/lib/api'
import { CATEGORY_LIST, relativeTime } from '@/lib/taxonomy-labels'
import { IdeaGenerator } from '@/components/idea-generator'

const STATUS_BADGE = {
  ongoing: { variant: 'solid', label: 'Live now' },
  upcoming: { variant: 'outline', label: 'Upcoming' },
  completed: { variant: 'ash', label: 'Completed' },
}

function Banner({ hackathon }) {
  const [failed, setFailed] = React.useState(false)
  if (!hackathon.bannerUrl || failed) {
    return (
      <div className="flex aspect-[3/1] items-end border-b-[3px] border-black bg-ash p-5">
        <span className="brutal-kicker text-concrete">
          {hackathon.organizer ?? hackathon.sourceName} did not publish a banner image
        </span>
      </div>
    )
  }
  return (
    <div className="border-b-[3px] border-black">
      <img
        src={hackathon.bannerUrl}
        alt={`Banner for ${hackathon.title}`}
        width={1200}
        height={400}
        decoding="async"
        fetchPriority="high"
        onError={() => setFailed(true)}
        className="aspect-[3/1] w-full bg-ash object-cover"
      />
    </div>
  )
}

export default function HackathonPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const { hackathon, related, loading, error, refetch } = useHackathon(slug)
  const [bookmarked, setBookmarked] = React.useState(false)
  const [bookmarkBusy, setBookmarkBusy] = React.useState(false)

  React.useEffect(() => {
    if (!isAuthenticated) return
    api
      .bookmarkIds()
      .then((result) => setBookmarked((result?.ids ?? []).length > 0 && result.ids.includes(hackathon?.id)))
      .catch(() => {})
  }, [isAuthenticated, hackathon?.id])

  const toggleBookmark = async () => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: `/hackathon/${slug}` } })
      toast('Sign in to save hackathons to your bookmarks.')
      return
    }
    setBookmarkBusy(true)
    try {
      if (bookmarked) await api.removeBookmark(hackathon.id)
      else await api.addBookmark(hackathon.id)
      setBookmarked(!bookmarked)
      toast(bookmarked ? 'Removed from bookmarks.' : 'Saved to bookmarks.')
    } catch {
      toast.error('Could not update your bookmarks. Try again.')
    } finally {
      setBookmarkBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-12 sm:px-6">
        <DetailSkeleton />
      </div>
    )
  }

  if (error || !hackathon) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 sm:px-6">
        <ErrorState
          title="Hackathon not found"
          error={error ?? new Error('This hackathon is not in the catalogue.')}
          onRetry={error ? refetch : undefined}
        />
        <div className="mt-6 flex justify-center">
          <Button asChild variant="outline">
            <Link to="/explore">
              <ArrowLeft /> Back to the catalogue
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  const status = STATUS_BADGE[hackathon.derivedStatus] ?? STATUS_BADGE.upcoming
  const category = CATEGORY_LIST.find((c) => c.key === hackathon.category)
  const isCompleted = hackathon.derivedStatus === 'completed'
  const registerUrl = hackathon.registrationUrl ?? hackathon.officialUrl

  return (
    <article className="pb-16">
      <div className="border-b-[3px] border-black bg-ash">
        <div className="mx-auto max-w-[1400px] px-4 pt-6 sm:px-6">
          <Button asChild variant="ghost" size="sm" className="-ml-3">
            <Link to="/explore">
              <ArrowLeft /> Back to explore
            </Link>
          </Button>
        </div>

        <div className="relative mx-auto max-w-[1400px] px-4 pt-4 sm:px-6">
          <Banner hackathon={hackathon} />

          <div className="relative -mt-px border-x-[3px] border-b-[3px] border-black bg-white p-5 sm:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={status.variant}>{status.label}</Badge>
              {category ? <Badge variant="outline">{category.label}</Badge> : null}
              {hackathon.beginnerFriendly ? <Badge variant="ash">Beginner friendly</Badge> : null}
              {hackathon.isFree ? <Badge variant="ash">Free to enter</Badge> : null}
              {hackathon.featured ? <Badge variant="solid">Featured</Badge> : null}
            </div>

            <h1 className="mt-4 max-w-4xl font-display text-4xl uppercase leading-[0.9] tracking-[-0.035em] sm:text-6xl">
              {hackathon.title}
            </h1>

            <p className="mt-4 font-mono text-xs uppercase tracking-[0.16em] text-concrete">
              {hackathon.organizer ? `Organised by ${hackathon.organizer}` : 'Organiser not published'} ·{' '}
              {hackathon.dateRangeLabel ?? 'Dates not published'}
              {hackathon.country ? ` · ${hackathon.country}` : ''}
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              {registerUrl ? (
                <Button asChild size="lg">
                  <a href={registerUrl} target="_blank" rel="noopener noreferrer nofollow">
                    {isCompleted ? 'View the official listing' : 'Register on the official site'}
                    <ExternalLink />
                  </a>
                </Button>
              ) : (
                <Button size="lg" disabled>
                  No registration link published
                </Button>
              )}

              <Button
                size="lg"
                variant="outline"
                onClick={toggleBookmark}
                disabled={bookmarkBusy}
                aria-pressed={bookmarked}
              >
                {bookmarked ? <BookmarkCheck /> : <Bookmark />}
                {bookmarked ? 'Bookmarked' : 'Bookmark'}
              </Button>

              {hackathon.officialUrl ? (
                <Button asChild size="lg" variant="ghost">
                  <a href={hackathon.officialUrl} target="_blank" rel="noopener noreferrer nofollow">
                    Official page <ExternalLink />
                  </a>
                </Button>
              ) : null}
            </div>

            {hackathon.summary ? (
              <p className="mt-6 max-w-3xl text-lg leading-relaxed text-soot">{hackathon.summary}</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr] lg:items-start">
          {/* ------------------------------------------------------ main col -- */}
          <div className="min-w-0">
            {hackathon.technologies.length || hackathon.themes.length ? (
              <div className="mb-8">
                <p className="brutal-kicker">Tags published by the organiser</p>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {hackathon.technologies.map((tech) => (
                    <li key={`t-${tech}`}>
                      <Link
                        to={`/explore?technology=${encodeURIComponent(tech)}`}
                        className="inline-block border-2 border-black px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] transition-colors hover:bg-black hover:text-white"
                      >
                        {tech}
                      </Link>
                    </li>
                  ))}
                  {hackathon.themes.map((theme) => (
                    <li key={`h-${theme}`}>
                      <span className="inline-block border-2 border-ash bg-ash px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-soot">
                        {theme}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <Tabs defaultValue="overview">
              <TabsList className="w-full overflow-x-auto">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="ideas">Project ideas</TabsTrigger>
                <TabsTrigger value="criteria">
                  {hackathon.judgingCriteria ? 'Judging' : 'Details'}
                </TabsTrigger>
                <TabsTrigger value="dates">Dates</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-6">
                {hackathon.description ? (
                  <div className="max-w-none space-y-4 text-[15px] leading-relaxed text-soot">
                    {hackathon.description.split(/\n{2,}/).map((paragraph, index) => (
                      <p key={index} className="whitespace-pre-line">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={ScrollText}
                    title="The organiser has not published a description"
                    description="This listing came from a platform feed that does not include long-form text. The full brief is on the organiser's own page."
                    action={
                      registerUrl ? (
                        <Button asChild variant="outline">
                          <a href={registerUrl} target="_blank" rel="noopener noreferrer nofollow">
                            Read the official brief <ExternalLink />
                          </a>
                        </Button>
                      ) : null
                    }
                  />
                )}

                {hackathon.faq?.length ? (
                  <section className="mt-10">
                    <h2 className="flex items-center gap-2 font-display text-2xl uppercase leading-none tracking-[-0.02em]">
                      <HelpCircle className="size-6 stroke-[2.5]" aria-hidden /> FAQ
                    </h2>
                    <dl className="mt-5 divide-y-2 divide-ash border-t-[3px] border-black">
                      {hackathon.faq.map((item, index) => (
                        <div key={index} className="py-4">
                          <dt className="font-display text-base uppercase leading-tight tracking-[-0.01em]">
                            {item.question}
                          </dt>
                          <dd className="mt-2 text-sm leading-relaxed text-soot">{item.answer}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ) : null}
              </TabsContent>

              <TabsContent value="ideas" className="mt-6">
                <IdeaGenerator hackathon={hackathon} />
              </TabsContent>

              <TabsContent value="criteria" className="mt-6">
                {hackathon.judgingCriteria ? (
                  <section>
                    <h2 className="flex items-center gap-2 font-display text-2xl uppercase leading-none tracking-[-0.02em]">
                      <Scale className="size-6 stroke-[2.5]" aria-hidden /> How submissions are judged
                    </h2>
                    <div className="mt-4 max-w-none space-y-4 text-[15px] leading-relaxed text-soot">
                      {hackathon.judgingCriteria.split(/\n{2,}/).map((paragraph, index) => (
                        <p key={index} className="whitespace-pre-line">
                          {paragraph}
                        </p>
                      ))}
                    </div>
                    <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-concrete">
                      Reproduced verbatim from the organiser's listing.
                    </p>
                  </section>
                ) : hackathon.eligibility ? (
                  <section>
                    <h2 className="flex items-center gap-2 font-display text-2xl uppercase leading-none tracking-[-0.02em]">
                      <Users className="size-6 stroke-[2.5]" aria-hidden /> Who can participate
                    </h2>
                    <div className="mt-4 max-w-none space-y-4 text-[15px] leading-relaxed text-soot">
                      {hackathon.eligibility.split(/\n{2,}/).map((paragraph, index) => (
                        <p key={index} className="whitespace-pre-line">
                          {paragraph}
                        </p>
                      ))}
                    </div>
                  </section>
                ) : (
                  <EmptyState
                    icon={Scale}
                    title="No published judging criteria"
                    description="Neither judging criteria nor eligibility rules have been published for this event on its source. Check the official listing for the authoritative version."
                  />
                )}

                {hackathon.judgingCriteria && hackathon.eligibility ? (
                  <section className="mt-10">
                    <h2 className="flex items-center gap-2 font-display text-2xl uppercase leading-none tracking-[-0.02em]">
                      <Users className="size-6 stroke-[2.5]" aria-hidden /> Eligibility
                    </h2>
                    <div className="mt-4 max-w-none space-y-4 text-[15px] leading-relaxed text-soot">
                      {hackathon.eligibility.split(/\n{2,}/).map((paragraph, index) => (
                        <p key={index} className="whitespace-pre-line">
                          {paragraph}
                        </p>
                      ))}
                    </div>
                  </section>
                ) : null}
              </TabsContent>

              <TabsContent value="dates" className="mt-6">
                <section>
                  <h2 className="flex items-center gap-2 font-display text-2xl uppercase leading-none tracking-[-0.02em]">
                    <CalendarDays className="size-6 stroke-[2.5]" aria-hidden /> Key dates
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-soot">
                    Every timestamp below is stored in UTC exactly as the organiser published it. HackRadar
                    does not estimate or adjust dates it was not given.
                  </p>
                  <dl className="mt-5 border-t-[3px] border-black">
                    <DataRow
                      label="Event starts"
                      value={
                        hackathon.startDate
                          ? `${new Date(hackathon.startDate).toUTCString()}`
                          : 'Not published'
                      }
                    />
                    <DataRow
                      label="Event ends"
                      value={
                        hackathon.endDate ? `${new Date(hackathon.endDate).toUTCString()}` : 'Not published'
                      }
                    />
                    <DataRow
                      label="Registration deadline"
                      value={
                        hackathon.registrationDeadline
                          ? `${new Date(hackathon.registrationDeadline).toUTCString()}`
                          : 'Not published'
                      }
                    />
                    <DataRow
                      label="Published by organiser"
                      value={
                        hackathon.sourcePublishedAt
                          ? `${new Date(hackathon.sourcePublishedAt).toUTCString()}`
                          : 'Source does not publish this'
                      }
                    />
                    <DataRow
                      label="First seen by HackRadar"
                      value={
                        hackathon.firstDiscoveredAt
                          ? `${new Date(hackathon.firstDiscoveredAt).toUTCString()}`
                          : 'Unknown'
                      }
                    />
                    <DataRow
                      label="Last re-checked"
                      value={
                        hackathon.lastVerifiedAt
                          ? `${new Date(hackathon.lastVerifiedAt).toUTCString()}`
                          : 'Not yet re-checked'
                      }
                    />
                  </dl>

                  <CapabilityNotice
                    className="mt-6"
                    title="Three different dates, three different meanings"
                  >
                    <strong>Published by organiser</strong> is when the source says it posted the listing.
                    <strong className="ml-1"> First seen by HackRadar</strong> is when this platform
                    discovered it. <strong className="ml-1">Last re-checked</strong> is when we last
                    successfully re-fetched it. They are frequently days or weeks apart, and none of them is
                    a substitute for the organiser&rsquo;s own page.
                  </CapabilityNotice>
                </section>
              </TabsContent>
            </Tabs>
          </div>

          {/* ----------------------------------------------------- side col -- */}
          <aside className="space-y-5 lg:sticky lg:top-24">
            <Card className="shadow-brutal">
              <h2 className="border-b-[3px] border-black bg-black px-4 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-white">
                At a glance
              </h2>
              <dl className="px-4 py-1">
                <DataRow
                  label="Format"
                  value={
                    hackathon.eventFormat === 'unknown'
                      ? 'Not stated by the source'
                      : hackathon.eventFormat === 'offline'
                        ? 'In person'
                        : hackathon.eventFormat === 'hybrid'
                          ? 'Hybrid'
                          : 'Online'
                  }
                />
                <DataRow label="Location" value={hackathon.location || 'Not published'} />
                <DataRow label="Country" value={hackathon.country || 'Not published'} />
                <DataRow
                  label="Prize pool"
                  value={
                    hackathon.prizePool
                      ? `${hackathon.currency ? `${hackathon.currency} ` : ''}${Number(hackathon.prizePool).toLocaleString('en-US')}`
                      : 'Not published'
                  }
                />
                <DataRow label="Team size" value={hackathon.teamSize || 'Not published'} />
                <DataRow
                  label="Participants"
                  value={
                    hackathon.participantCount != null
                      ? Number(hackathon.participantCount).toLocaleString('en-US')
                      : 'Not published'
                  }
                />
                <DataRow label="Fee" value={hackathon.isPaid ? 'Paid' : hackathon.isFree ? 'Free' : 'Not stated'} />
                <DataRow label="Source" value={hackathon.sourceName} />
              </dl>
            </Card>

            <Card className="p-4 shadow-brutal">
              <p className="brutal-kicker mb-3">Data provenance</p>
              <ul className="space-y-2 font-mono text-[11px] uppercase tracking-[0.1em] text-soot">
                <li className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <RadioTower className="size-3.5 stroke-[3]" aria-hidden /> Discovered
                  </span>
                  <span className="font-bold text-black">{relativeTime(hackathon.firstDiscoveredAt)}</span>
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <Clock className="size-3.5 stroke-[3]" aria-hidden /> Last verified
                  </span>
                  <span className="font-bold text-black">{relativeTime(hackathon.lastVerifiedAt) ?? '—'}</span>
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <Globe className="size-3.5 stroke-[3]" aria-hidden /> Read from
                  </span>
                  <span className="font-bold text-black">{hackathon.sourceName}</span>
                </li>
              </ul>
              {hackathon.sourceUrl ? (
                <a
                  href={hackathon.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="mt-3 inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] underline decoration-[3px] underline-offset-4 hover:no-underline"
                >
                  Source listing <ExternalLink className="size-3 stroke-[3]" />
                </a>
              ) : null}
            </Card>

            {hackathon.prizePool ? (
              <Card className="flex items-center gap-4 p-4 shadow-brutal">
                <span className="flex size-12 shrink-0 items-center justify-center border-[3px] border-black bg-black text-white">
                  <Trophy className="size-6 stroke-[2.5]" />
                </span>
                <div className="min-w-0">
                  <p className="font-display text-2xl uppercase leading-none tracking-[-0.02em]">
                    {hackathon.currency ? `${hackathon.currency} ` : ''}
                    {Number(hackathon.prizePool).toLocaleString('en-US')}
                  </p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-concrete">
                    Prize pool as published — not a guarantee of payment
                  </p>
                </div>
              </Card>
            ) : null}

            {hackathon.isPaid ? (
              <CapabilityNotice title="This listing has an entry fee" tone="plain">
                A fee means this is not a free-to-enter event. Check the official listing for the amount and
                refund policy before committing.
              </CapabilityNotice>
            ) : null}
          </aside>
        </div>

        {related.length ? (
          <section className="mt-20">
            <SectionHeader
              kicker="More like this"
              title="Related hackathons"
              description="Same category, and not the event you are reading."
            />
            <Stagger className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {related.slice(0, 3).map((item) => (
                <StaggerItem key={item.id}>
                  <HackathonCard hackathon={item} />
                </StaggerItem>
              ))}
            </Stagger>
          </section>
        ) : null}
      </div>
    </article>
  )
}