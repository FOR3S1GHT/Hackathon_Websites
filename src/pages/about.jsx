import { Link } from 'react-router-dom'
import { ArrowRight, CalendarClock, Cpu, Fingerprint, Layers, Scale, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { CapabilityNotice, DataRow, PageHeader, SectionHeader } from '@/components/feedback'
import { RevealFromBlack, Stagger, StaggerItem } from '@/components/motion'
import { CATEGORY_LIST } from '@/lib/taxonomy-labels'
import { relativeTime } from '@/lib/format'

export default function AboutPage({ meta }) {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader
        kicker="About"
        title="A hackathon radar that tells you the truth"
        description="HackRadar exists because finding a hackathon worth entering should not mean scrolling through forty inconsistent listing pages, half of them with a registration deadline from 2019."
      />

      {/* -------------------------------------------------------------- why -- */}
      <section className="mt-14">
        <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-start">
          <div className="max-w-3xl space-y-5 text-base leading-relaxed text-soot">
            <p>
              Every hackathon listing on the internet was written by a different person for a different
              purpose. Some have a real prize pool; some say &ldquo;TBA&rdquo; and never update. Some are
              online, some are in a city you would have to fly to, and some are from 2021 and still rank on
              page one.
            </p>
            <p>
              HackRadar reads the machine-readable listings those platforms already publish, normalises them
              into a single schema, merges duplicates, and tells you plainly what is known and what is not. Where
              a source does not publish a field, the card says so instead of guessing.
            </p>
            <p>
              The result is a catalogue you can actually filter: by whether registration is open, by how long
              you have left to decide, by whether it is online from where you are, by what it pays, and by
              whether a beginner can realistically enter.
            </p>
          </div>

          <Card className="px-5 py-2 shadow-brutal">
            <p className="brutal-kicker border-b-[3px] border-black py-3">At a glance</p>
            <dl>
              <DataRow label="Hackathons indexed" value={(meta?.stats?.hackathons ?? 0).toLocaleString('en-US')} />
              <DataRow label="Upcoming or live" value={(meta?.stats?.activeHackathons ?? 0).toLocaleString('en-US')} />
              <DataRow label="Categories" value={CATEGORY_LIST.length} />
              <DataRow label="Sources reading" value={(meta?.sources ?? []).filter((s) => s.enabled).length} />
              <DataRow label="Documented gaps" value={(meta?.unavailableSources ?? []).length} />
              <DataRow
                label="Last refreshed"
                value={meta?.sync?.lastRefreshedAt ? relativeTime(meta.sync.lastRefreshedAt) : 'Never'}
              />
              <DataRow label="Datastore" value={meta?.store ?? '—'} />
            </dl>
          </Card>
        </div>
      </section>

      {/* --------------------------------------------------------- the rules -- */}
      <section className="mt-20">
        <SectionHeader kicker="Principles" title="Six rules this project will not break" />
        <Stagger className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: Fingerprint,
              title: 'No invented data',
              body: 'Every field is either published by the source or null. Missing data is shown as missing. HackRadar never fills a gap with a plausible guess.',
            },
            {
              icon: CalendarClock,
              title: 'Three dates, never conflated',
              body: 'The date the organiser published, the date HackRadar discovered the listing, and the date we last re-verified it are stored and displayed separately, because they are frequently weeks apart.',
            },
            {
              icon: Scale,
              title: 'Only permitted access',
              body: 'Public APIs and feeds only. No bypassing logins, CAPTCHAs, paywalls or anti-bot measures. Sources without a permitted machine-readable path are documented, not scraped.',
            },
            {
              icon: Layers,
              title: 'One schema, many sources',
              body: 'Whatever the source shape, everything lands in the same normalised schema with the same field meanings, which is what makes deduplication and honest labelling possible.',
            },
            {
              icon: Sparkles,
              title: 'Generated ideas are labelled',
              body: 'Suggestions always say whether they came from deterministic rules or an AI model, and always carry the disclaimer that they are not organiser requirements and guarantee nothing.',
            },
            {
              icon: Cpu,
              title: 'Honest about its own limits',
              body: 'Polling is described as polling. The unread badge is described as polled. Credential-gated features are shown as unavailable instead of failing silently at the click.',
            },
          ].map((rule) => (
            <StaggerItem key={rule.title}>
              <RevealFromBlack>
                <Card className="h-full p-5 shadow-brutal">
                  <rule.icon className="size-7 stroke-[2.5]" aria-hidden />
                  <h3 className="mt-4 font-display text-xl uppercase leading-none tracking-[-0.02em]">
                    {rule.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-soot">{rule.body}</p>
                </Card>
              </RevealFromBlack>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* ------------------------------------------------------ how it works -- */}
      <section className="mt-20">
        <SectionHeader
          kicker="Method"
          title="How classification and dedupe work"
          description="Detailed enough that you can disagree with it."
        />
        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          <Card className="p-6 shadow-brutal">
            <h3 className="font-display text-2xl uppercase leading-none tracking-[-0.025em]">One primary category</h3>
            <p className="mt-4 text-sm leading-relaxed text-soot">
              Each hackathon gets exactly one category from fourteen. Keywords are matched against the title,
              description, themes and tags the organiser published, using word-boundary matching rather than
              substring matching.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-soot">
              That distinction matters: substring matching made <code className="border-2 border-black px-1 font-mono">ui</code>{' '}
              match &ldquo;build&rdquo;, <code className="border-2 border-black px-1 font-mono">ar</code> match
              &ldquo;start&rdquo; and <code className="border-2 border-black px-1 font-mono">vr</code> match
              &ldquo;over&rdquo;, which polluted three categories at once.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-soot">
              When nothing matches confidently, the event lands in <strong>Open innovation</strong> with the
              scores left visible. An honest fallback beats a confident wrong answer.
            </p>
            <ul className="mt-5 flex flex-wrap gap-1.5">
              {CATEGORY_LIST.map((category) => (
                <li
                  key={category.key}
                  className="border-2 border-ash bg-ash px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em]"
                >
                  {category.label}
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-6 shadow-brutal">
            <h3 className="font-display text-2xl uppercase leading-none tracking-[-0.025em]">
              Deterministic deduplication
            </h3>
            <p className="mt-4 text-sm leading-relaxed text-soot">
              The same event is frequently listed on two or three platforms. HackRadar clusters records using a
              normalised title, the organiser, and overlapping event dates. Punctuation, casing and filler words
              like &ldquo;hackathon&rdquo; or &ldquo;challenge&rdquo; are stripped before comparison.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-soot">
              Within a cluster the record with the most complete detail wins, but every surviving card still
              links to the organiser&rsquo;s own page, and the &ldquo;via&rdquo; label names the platform the
              surviving record came from. Clustering is deterministic — the same input always produces the same
              merge, which is what makes the automated tests meaningful.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-soot">
              <code className="border-2 border-black bg-ash px-1 font-mono">first_discovered_at</code> is written
              once, on first sight, and never overwritten. That is what makes a &ldquo;New&rdquo; badge mean
              new to HackRadar rather than newly announced.
            </p>
          </Card>
        </div>
      </section>

      {/* ---------------------------------------------------------- features -- */}
      <section className="mt-20">
        <SectionHeader kicker="What it does" title="Features, honestly labelled" />
        <Stagger className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['Search & filter', 'Debounced free-text across name, organiser, technology, category, theme and location, combined with 14 filters and 6 sorts. All state lives in the URL, so any view is a shareable link.'],
            ['Live updates', 'A Server-Sent Events stream pushes a signal when a sync completes, so lists refresh in place. This is sync-triggered, not publish-triggered.'],
            ['Bookmarks & ideas', 'Saved hackathons and generated project ideas live in your account and drive dashboard recommendations scored against what you actually saved.'],
            ['Notifications', 'In-app always available. Push and email require both explicit permission and server credentials; both are labelled as unavailable rather than silently failing.'],
            ['Project ideas', 'Per-hackathon suggestions built from that event&rsquo;s own themes. Copy, download, compare, regenerate and filter by difficulty. AI is used only when configured, and always labelled.'],
            ['Zero-config mode', 'Runs with no credentials at all: local JSON datastore, local accounts with scrypt hashing, rule-based ideas, no push, no email.'],
          ].map(([title, body]) => (
            <StaggerItem key={title}>
              <Card className="h-full p-5 shadow-brutal">
                <h3 className="font-display text-lg uppercase leading-none tracking-[-0.02em]">{title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-soot">{body}</p>
              </Card>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      <CapabilityNotice
        className="mt-16"
        title="Independence"
        action={
          <Button asChild variant="outline">
            <Link to="/data-sources">
              See every source <ArrowRight />
            </Link>
          </Button>
        }
      >
        HackRadar is an independent project. It is not affiliated with, endorsed by, or sponsored by any
        hackathon organiser or platform it reads. Organiser names and event details belong to their owners.
        HackRadar links out rather than reproducing copyrighted assets, and uses only banner images published
        by the organiser on their own listing.
      </CapabilityNotice>
    </div>
  )
}