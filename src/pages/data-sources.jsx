import { Link } from 'react-router-dom'
import {
  Activity,
  ArrowRight,
  Ban,
  Boxes,
  Database,
  Fingerprint,
  GitMerge,
  RadioTower,
  RefreshCw,
  Scale,
  Tag,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DataRow, PageHeader, SectionHeader } from '@/components/feedback'
import { Stagger, StaggerItem } from '@/components/motion'
import { relativeTime } from '@/lib/format'

const INTEGRATION_LABEL = {
  'public-api': 'Public API',
  'public-endpoint': 'Public endpoint',
  'optional-credentials': 'Credential-gated',
}

/**
 * Data sources, published openly.
 *
 * The point of this page is accountability: which platforms HackRadar reads,
 * how, and — just as importantly — which ones it deliberately does not read and
 * exactly why.
 */
export default function DataSourcesPage({ meta }) {
  const sources = meta?.sources ?? []
  const unavailable = meta?.unavailableSources ?? []
  const runs = meta?.sync?.recentRuns ?? []
  const enabled = sources.filter((s) => s.enabled)

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader
        kicker="Transparency"
        title="Where the data comes from"
        description="HackRadar reads only machine-readable endpoints that the platform itself publishes and permits automated access. No login is bypassed, no CAPTCHA is solved, no paywall is climbed, and no page is scraped where an API does not exist."
        action={
          <Button asChild variant="outline">
            <Link to="/contact">
              Report bad data <ArrowRight />
            </Link>
          </Button>
        }
      />

      {/* --------------------------------------------------------- sources -- */}
      <section className="mt-12">
        <SectionHeader
          // Before /api/meta resolves there are no sources to count, and
          // printing "0 active" in that window asserts a falsehood for a beat.
          kicker={meta ? `${enabled.length} active` : 'Loading'}
          title="Integrated sources"
          description="Each source declares its own terms of use in robots.txt or its API documentation; HackRadar honours those declarations."
        />

        <Stagger className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {sources.map((source) => (
            <StaggerItem key={source.name}>
              <Card className="flex h-full flex-col p-5 shadow-brutal">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-display text-2xl uppercase leading-none tracking-[-0.025em]">
                      {source.label}
                    </h3>
                    <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-concrete">
                      {source.name}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant={source.enabled ? 'solid' : 'ash'}>
                      {source.enabled ? 'Active' : 'Disabled'}
                    </Badge>
                    <Badge variant="outline">
                      {INTEGRATION_LABEL[source.integration] ?? source.integration}
                    </Badge>
                  </div>
                </div>

                <p className="mt-4 text-sm leading-relaxed text-soot">{source.note}</p>

                <div className="mt-auto flex flex-wrap gap-4 pt-5 font-mono text-[10px] uppercase tracking-[0.12em]">
                  <a
                    href={source.homepage}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="underline decoration-[3px] underline-offset-4 hover:no-underline"
                  >
                    Platform
                  </a>
                  {source.docsUrl ? (
                    <a
                      href={source.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="underline decoration-[3px] underline-offset-4 hover:no-underline"
                    >
                      Endpoint
                    </a>
                  ) : null}
                  {source.termsUrl ? (
                    <a
                      href={source.termsUrl}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="underline decoration-[3px] underline-offset-4 hover:no-underline"
                    >
                      Terms
                    </a>
                  ) : null}
                </div>
              </Card>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* --------------------------------------------------- unavailable -- */}
      <section className="mt-20">
        <SectionHeader
          kicker="Documented gaps"
          title="What HackRadar deliberately does not read"
          description="These platforms are visible to most people looking for hackathons. They are listed here so the absence is explained rather than hidden. In every case the blocker is a permission or capability one, not an engineering one HackRadar chose to skip."
        />

        <Stagger className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {unavailable.map((source) => (
            <StaggerItem key={source.name}>
              <Card className="flex h-full flex-col border-[3px] border-dashed border-black p-5">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center border-[3px] border-black bg-white">
                    <Ban className="size-5 stroke-[2.5]" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-display text-lg uppercase leading-none tracking-[-0.02em]">
                      {source.label}
                    </h3>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-concrete">
                      Not integrated
                    </p>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-soot">{source.reason}</p>
                <a
                  href={source.homepage}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="mt-auto pt-5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] underline decoration-[3px] underline-offset-4 hover:no-underline"
                >
                  Visit the platform →
                </a>
              </Card>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* -------------------------------------------------------- pipeline -- */}
      <section className="mt-20">
        <SectionHeader kicker="Pipeline" title="How a listing becomes a card" />
        <Stagger className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            {
              icon: RefreshCw,
              title: 'Fetch',
              body: 'Each enabled source is read on its own schedule with a token-bucket rate limiter, 3 retries and exponential backoff.',
            },
            {
              icon: Boxes,
              title: 'Normalise',
              body: 'Every record is mapped onto one schema. Dates become ISO-8601 UTC. Missing values stay null — never guessed.',
            },
            {
              icon: GitMerge,
              title: 'Deduplicate',
              body: 'The same event on two platforms is merged by normalised title, organiser and overlapping dates. The richest copy wins.',
            },
            {
              icon: Tag,
              title: 'Classify',
              body: 'One primary category from 14, technologies and themes from published text. Word-boundary matching, never substring guessing.',
            },
            {
              icon: Database,
              title: 'Store',
              body: 'Upsert into Supabase or a local JSON file, recording first_discovered_at so "new" means new to us.',
            },
          ].map((step) => (
            <StaggerItem key={step.title}>
              <Card className="h-full p-4 shadow-brutal">
                <step.icon className="size-6 stroke-[2.5]" aria-hidden />
                <h3 className="mt-3 font-display text-base uppercase leading-none tracking-[-0.02em]">
                  {step.title}
                </h3>
                <p className="mt-2 text-[13px] leading-relaxed text-soot">{step.body}</p>
              </Card>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* ------------------------------------------------------ sync health -- */}
      <section className="mt-20">
        <SectionHeader
          kicker="Sync health"
          title="Recent runs"
          description="Every run is logged per source, including failures. A failed source never silently blanks a category — it just stops refreshing and says so here."
          action={
            <Button asChild variant="outline">
              <Link to="/explore">
                Browse the catalogue <ArrowRight />
              </Link>
            </Button>
          }
        />

        <div className="mt-8 grid gap-5 lg:grid-cols-[1.2fr_1fr] lg:items-start">
          <Card className="overflow-x-auto shadow-brutal">
            {runs.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-soot">No sync runs recorded yet.</p>
            ) : (
              <table className="w-full min-w-[560px] border-collapse text-left">
                <caption className="sr-only">Recent source sync runs</caption>
                <thead>
                  <tr className="border-b-[3px] border-black bg-black text-white">
                    {['Source', 'Status', 'Discovered', 'Updated', 'Took', 'When'].map((heading) => (
                      <th
                        key={heading}
                        scope="col"
                        className="px-3 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em]"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run, index) => (
                    <tr key={`${run.sourceName}-${index}`} className="border-b-2 border-ash last:border-b-0">
                      <td className="px-3 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.1em]">
                        {run.sourceName}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant={run.status === 'success' ? 'outline' : 'solid'} size="sm">
                          {run.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs">{run.eventsDiscovered ?? '—'}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">{run.eventsUpdated ?? '—'}</td>
                      <td className="px-3 py-2.5 font-mono text-[10px] text-concrete">
                        {run.durationMs != null ? `${(run.durationMs / 1000).toFixed(1)}s` : '—'}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-concrete">
                        {relativeTime(run.syncStartedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="border-t-[3px] border-black bg-ash px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-soot">
              Discovered = events this source returned this run. Updated = catalogue records it contributed or
              refreshed. A source inside its poll interval is not re-fetched and writes no row.
            </p>
          </Card>

          <Card className="px-5 py-2 shadow-brutal">
            <p className="brutal-kicker border-b-[3px] border-black py-3">Current configuration</p>
            <dl>
              <DataRow label="Datastore driver" value={meta?.store ?? '—'} />
              <DataRow label="Server environment" value={meta?.env ?? '—'} />
              <DataRow label="Schedule" value={meta?.sync?.cron ?? '—'} />
              <DataRow
                label="Per-source interval"
                // The API sends an object keyed by source, so stringifying it
                // rendered the literal text "[object Object]" here. The server
                // also sends a pre-formatted summary for exactly this case.
                value={meta?.sync?.perSourceIntervalSummary ?? 'Every full run'}
              />
              <DataRow
                label="Enrichment budget"
                value={
                  meta?.capabilities?.enrichmentBudget
                    ? `${meta.capabilities.enrichmentBudget} records per run`
                    : 'Off'
                }
              />
              <DataRow
                label="Last successful sync"
                value={
                  // `lastSuccessfulSync` is a sync_logs row, so the meaningful
                  // timestamp is when the run completed, not when it began.
                  meta?.sync?.lastRefreshedAt
                    ? relativeTime(meta.sync.lastRefreshedAt)
                    : 'Never'
                }
              />
              <DataRow
                // Deliberately `lastSyncAt` (last attempt) and not
                // `lastRefreshedAt`. A run in which every source was still
                // inside its poll interval takes ~0 ms, writes no rows, and
                // still counts as an attempt — so this row is labelled as one.
                label="Last run attempted"
                value={meta?.sync?.lastSyncAt ? relativeTime(meta.sync.lastSyncAt) : 'Never'}
              />
              <DataRow label="Sync running now" value={meta?.sync?.running ? 'Yes' : 'No'} />
            </dl>
            <p className="flex items-start gap-2 border-t-2 border-ash py-4 font-mono text-[10px] uppercase leading-relaxed tracking-[0.12em] text-concrete">
              <Activity className="mt-0.5 size-3.5 shrink-0 stroke-[3]" aria-hidden />
              {meta?.sync?.disclosure ??
                'A polling interval means new listings appear within roughly one interval of an organiser publishing them. HackRadar is not an instant mirror and does not claim to be.'}
            </p>
          </Card>
        </div>
      </section>

      {/* -------------------------------------------------------- policies -- */}
      <section className="mt-20">
        <SectionHeader kicker="Rules" title="Non-negotiables" />
        <Stagger className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[
            {
              icon: Scale,
              title: 'Only official endpoints',
              body: 'Public APIs, official feeds and endpoints a platform documents. If a platform offers no machine-readable access, HackRadar documents that instead of scraping.',
            },
            {
              icon: Ban,
              title: 'No bypassing anything',
              body: 'No login walls, CAPTCHAs, rate-limit evasion, paywalls or anti-bot measures are circumvented. If an endpoint requires credentials, it stays disabled until real credentials are supplied.',
            },
            {
              icon: Fingerprint,
              title: 'Honest provenance',
              body: 'Every card shows which platform it came from, when HackRadar first saw it, and when it was last re-verified. Organiser publish dates are never conflated with discovery dates.',
            },
            {
              icon: RadioTower,
              title: 'Honest freshness',
              body: 'The interface states its polling interval. The unread badge is described as polled, not real-time. The footer says out loud that HackRadar is not an instant mirror.',
            },
          ].map((rule) => (
            <StaggerItem key={rule.title}>
              <Card className="flex h-full gap-4 p-5 shadow-brutal">
                <rule.icon className="size-6 shrink-0 stroke-[2.5]" aria-hidden />
                <div>
                  <h3 className="font-display text-lg uppercase leading-none tracking-[-0.02em]">{rule.title}</h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-soot">{rule.body}</p>
                </div>
              </Card>
            </StaggerItem>
          ))}
        </Stagger>
      </section>
    </div>
  )
}