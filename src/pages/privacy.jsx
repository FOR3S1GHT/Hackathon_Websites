import { Link } from 'react-router-dom'
import { Database, Eye, KeyRound, Mail, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader, SectionHeader } from '@/components/feedback'

/**
 * Privacy policy.
 *
 * Written to describe what this specific software actually does, not as a
 * generic template. Every claim here corresponds to a behaviour in the code.
 */
export default function PrivacyPage({ meta }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader
        kicker="Legal"
        title="Privacy"
        description="What HackRadar stores, why, and how to get rid of it. Short, because there is not much to say."
      />

      <div className="mt-12 space-y-12 text-[15px] leading-relaxed text-soot">
        <section>
          <SectionHeader kicker="Summary" title="The short version" />
          <div className="mt-5 space-y-4">
            <p>
              You can browse every part of HackRadar without an account. If you create one, HackRadar stores
              your email address and whatever you explicitly save. There are no analytics services, no
              advertising networks, no third-party trackers and no data sale of any kind.
            </p>
            <p>
              HackRadar itself never stores passwords. Authentication is delegated to Supabase when it is
              configured; otherwise the backend hashes passwords with scrypt and keeps only the hash.
            </p>
          </div>
        </section>

        <section>
          <SectionHeader kicker="Collected" title="What is stored, and why" />
          <div className="mt-5 space-y-4">
            <Card className="p-5 shadow-brutal">
              <h3 className="flex items-center gap-2 font-display text-lg uppercase leading-none tracking-[-0.02em]">
                <KeyRound className="size-5 stroke-[2.5]" aria-hidden /> Account data
              </h3>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex gap-3">
                  <dt className="min-w-40 shrink-0 font-bold text-black">Email address</dt>
                  <dd>
                    Only if you create an account. Used to sign you in and, only if you subscribe, to send the
                    emails you asked for.
                  </dd>
                </div>
                <div className="flex gap-3">
                  <dt className="min-w-40 shrink-0 font-bold text-black">Display name</dt>
                  <dd>Optional. Used to label your saved project ideas.</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="min-w-40 shrink-0 font-bold text-black">Password</dt>
                  <dd>
                    Never stored by HackRadar in plain text. Supabase holds it when Supabase Auth is active;
                    otherwise only a scrypt hash plus a per-account salt is kept.
                  </dd>
                </div>
              </dl>
            </Card>

            <Card className="p-5 shadow-brutal">
              <h3 className="flex items-center gap-2 font-display text-lg uppercase leading-none tracking-[-0.02em]">
                <Database className="size-5 stroke-[2.5]" aria-hidden /> Your content
              </h3>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex gap-3">
                  <dt className="min-w-40 shrink-0 font-bold text-black">Bookmarks</dt>
                  <dd>The hackathons you saved and when.</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="min-w-40 shrink-0 font-bold text-black">Saved ideas</dt>
                  <dd>Project ideas you chose to keep, plus which hackathon they were for.</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="min-w-40 shrink-0 font-bold text-black">Notifications</dt>
                  <dd>Alerts delivered to you, with a read/unread flag.</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="min-w-40 shrink-0 font-bold text-black">Preferences</dt>
                  <dd>
                    Interest categories and technologies, alert subscriptions, and quiet-hours settings.
                  </dd>
                </div>
                <div className="flex gap-3">
                  <dt className="min-w-40 shrink-0 font-bold text-black">Push subscriptions</dt>
                  <dd>
                    Only if you explicitly grant browser push permission. This is an opaque endpoint URL, not
                    your location or device identity.
                  </dd>
                </div>
              </dl>
            </Card>

            <Card className="p-5 shadow-brutal">
              <h3 className="flex items-center gap-2 font-display text-lg uppercase leading-none tracking-[-0.02em]">
                <Eye className="size-5 stroke-[2.5]" aria-hidden /> Not collected
              </h3>
              <ul className="mt-4 space-y-2 text-sm">
                {[
                  'No advertising or cross-site tracking pixels.',
                  'No Google Analytics, no Mixpanel, no Hotjar, no third-party scripts of any kind.',
                  'No selling, renting or sharing your data with anyone.',
                  'No profiling for advertising purposes.',
                  'No background location, contact, camera or microphone access.',
                  'No cookies used for tracking. The only cookie is the httpOnly session cookie required to keep you signed in.',
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
          <SectionHeader kicker="Third parties" title="Who else sees your data" />
          <div className="mt-5 space-y-4">
            <p>
              <strong>Supabase</strong>, when configured, acts as the authentication provider and database. Your
              email address and account record live there under Supabase&rsquo;s own privacy policy. Row-level
              security means one account can never read another account&rsquo;s data through the API.
            </p>
            <p>
              <strong>Your chosen email or push provider</strong> receives only what is needed to deliver a
              message you subscribed to: your address and the alert content. Email digests include a
              one-click unsubscribe link that deletes the subscription server-side.
            </p>
            <p>
              <strong>The hackathon platforms HackRadar reads</strong> never receive anything about you. They are
              read as anonymous HTTP requests on a schedule; requests carry no user identifier, no cookie and no
              referrer from your browser.
            </p>
          </div>
        </section>

        <section>
          <SectionHeader kicker="Control" title="Your rights" />
          <div className="mt-5 space-y-4">
            <p>
              You can edit your display name, interests and notification preferences at any time from{' '}
              <Link to="/settings" className="font-bold underline decoration-[3px] underline-offset-4">
                settings
              </Link>
              . You can delete every saved idea and clear your notification history from the same page.
            </p>
            <p>
              For complete account deletion, use the{' '}
              <Link to="/contact" className="font-bold underline decoration-[3px] underline-offset-4">
                contact form
              </Link>
              . Accounts are deleted within 30 days, along with every associated bookmark, idea, notification and
              subscription. Ask for an export of your data at any time and you will get it as JSON.
            </p>
          </div>
        </section>

        <section>
          <SectionHeader kicker="Security" title="How it is protected" />
          <div className="mt-5 space-y-4">
            <ul className="space-y-2 text-sm">
              {[
                'Session cookies are httpOnly, SameSite=Lax and Secure in production.',
                'Every write endpoint is rate limited; idea generation has its own tighter budget.',
                'All input is validated server-side with a schema before it reaches a datastore.',
                'Row-level security policies in Supabase scope every user table to its owner.',
                'API keys, database URLs and AI provider keys live only in server environment variables and are never bundled into the client build.',
                'Error responses return a safe message and a machine-readable code — never a stack trace or an internal query.',
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden className="mt-2 inline-block size-1.5 shrink-0 bg-black" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-sm">
              {meta?.store === 'supabase'
                ? 'This deployment is running on Supabase with row-level security enabled.'
                : 'This deployment is running on the local JSON datastore. It is fully functional but intended for local use; run Supabase for production.'}
            </p>
          </div>
        </section>

        <section>
          <SectionHeader kicker="Contact" title="Questions or a deletion request" />
          <div className="mt-5 space-y-4">
            <p className="flex items-start gap-2">
              <Mail className="mt-1 size-4 shrink-0 stroke-[3]" aria-hidden />
              Use the contact form. Privacy questions and data deletion requests are answered within 30 days.
            </p>
            <Button asChild variant="outline">
              <Link to="/contact">
                <Trash2 /> Request data deletion
              </Link>
            </Button>
          </div>
        </section>
      </div>
    </div>
  )
}