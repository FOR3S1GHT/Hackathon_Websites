import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { CapabilityNotice, PageHeader, SectionHeader } from '@/components/feedback'

/** Terms of use. Specific to this software, not boilerplate. */
export default function TermsPage({ meta }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader
        kicker="Legal"
        title="Terms of use"
        description="The rules for using HackRadar, and the limits of what it can promise you."
      />

      <div className="mt-12 space-y-12 text-[15px] leading-relaxed text-soot">
        <CapabilityNotice title="Read this first">
          HackRadar is an independent project. It is not affiliated with, endorsed by or sponsored by any
          hackathon organiser or platform whose public listings it reads. Organiser names, event details and
          trademarks belong to their respective owners.
        </CapabilityNotice>

        <section>
          <SectionHeader kicker="Information" title="What HackRadar is, and is not" />
          <div className="mt-5 space-y-4">
            <p>
              HackRadar is a discovery and aggregation tool. It reads public, machine-readable listings that
              platforms publish for public consumption, normalises them, and presents them with links back to
              the original.
            </p>
            <p>
              <strong>HackRadar is not an organiser</strong> and cannot register you for anything, change your
              eligibility, extend a deadline, resolve a dispute, or guarantee that a listing is accurate. Every
              piece of event information originates with the organiser or the platform, and HackRadar may
              normalise, summarise or lag behind it.
            </p>
            <p>
              <strong>The authoritative source is always the organiser&rsquo;s own page.</strong> If this site and
              the official listing disagree, the official listing wins.
            </p>
          </div>
        </section>

        <section>
          <SectionHeader kicker="Freshness" title="Data is polled, not instant" />
          <div className="mt-5 space-y-4">
            <p>
              HackRadar re-reads each source on a schedule
              {meta?.sync?.perSourceIntervalMinutes
                ? ` (currently every ${meta.sync.perSourceIntervalMinutes} minutes)`
                : ''}
              . A newly published hackathon will normally appear within one polling interval of being announced,
              and occasionally later. Deadlines can change without warning upstream; HackRadar shows what it
              last saw and when.
            </p>
            <p>
              Three dates are tracked and displayed separately, and should not be confused: the date the
              organiser published, the date HackRadar first discovered the listing, and the date it was last
              re-verified.
            </p>
          </div>
        </section>

        <section>
          <SectionHeader kicker="Ideas" title="Project suggestions carry no guarantees" />
          <div className="mt-5 space-y-4">
            <p>
              Project ideas are derived from each event&rsquo;s published themes, tracks and technologies, using
              deterministic rules and — only where a provider is configured — an AI model. They are starting
              points.
            </p>
            <p>
              HackRadar has no knowledge of private judging criteria, sponsor priorities, other teams&rsquo;
              work or what an organiser will accept. <strong>No suggestion guarantees selection, a prize, or even
              that it qualifies as a valid entry.</strong> Always read the official brief, and treat every
              suggestion as unverified until you check it.
            </p>
          </div>
        </section>

        <section>
          <SectionHeader kicker="Conduct" title="Acceptable use" />
          <div className="mt-5">
            <Card className="p-5 shadow-brutal">
              <ul className="space-y-3 text-sm">
                {[
                  'Do not attempt to scrape, mirror or redistribute the HackRadar dataset. Use the API endpoints, which are rate limited, or link to HackRadar.',
                  'Do not use HackRadar to send unsolicited bulk email, harvest contact details or build marketing lists.',
                  'Do not attempt to bypass rate limits, authentication or access controls on HackRadar or on any upstream platform.',
                  'Do not misrepresent HackRadar as affiliated with an organiser, or use its name in a way that implies endorsement.',
                  'Do not attempt to disrupt the service — no denial-of-service, no resource exhaustion, no automated abuse of the sync trigger.',
                ].map((item) => (
                  <li key={item} className="flex gap-2">
                    <span aria-hidden className="mt-2 inline-block size-1.5 shrink-0 bg-black" />
                    {item}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </section>

        <section>
          <SectionHeader kicker="Content" title="Licensing and content ownership" />
          <div className="mt-5 space-y-4">
            <p>
              The HackRadar source code is the property of its contributors. Event titles, descriptions, logos
              and banner images belong to the organisers and platforms that publish them. HackRadar stores and
              displays only what those sources publish, links back to the original listing, and does not
              reproduce copyrighted long-form assets.
            </p>
            <p>
              If you are a rights holder and want a listing removed, use the{' '}
              <Link to="/contact" className="font-bold underline decoration-[3px] underline-offset-4">
                contact form
              </Link>
              . Requests are honoured promptly.
            </p>
          </div>
        </section>

        <section>
          <SectionHeader kicker="Warranty" title="No warranty" />
          <div className="mt-5 space-y-4">
            <p>
              HackRadar is provided as-is, without warranty of any kind, express or implied. It may contain
              errors, omissions, stale entries and misclassifications. It is not a substitute for the
              organiser&rsquo;s own information.
            </p>
            <p>
              To the maximum extent permitted by law, the maintainers are not liable for any loss or damage
              arising from use of HackRadar — including missed deadlines discovered too late, withdrawn events,
              or reliance on a listing that later changed.
            </p>
          </div>
        </section>

        <section>
          <SectionHeader kicker="Changes" title="Changes to these terms" />
          <div className="mt-5 space-y-4">
            <p>
              These terms may change. Material changes will be noted in the commit history, and the effective
              date below updated. Continued use after a change constitutes acceptance.
            </p>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-concrete">
              Last updated {new Date().toISOString().slice(0, 10)}
            </p>
          </div>
        </section>

        <Card className="p-5 shadow-brutal">
          <p className="text-sm">
            See also the{' '}
            <Link to="/privacy" className="font-bold underline decoration-[3px] underline-offset-4">
              privacy policy
            </Link>{' '}
            and the{' '}
            <Link to="/data-sources" className="font-bold underline decoration-[3px] underline-offset-4">
              data sources page
            </Link>
            .
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/explore">Back to the catalogue</Link>
          </Button>
        </Card>
      </div>
    </div>
  )
}