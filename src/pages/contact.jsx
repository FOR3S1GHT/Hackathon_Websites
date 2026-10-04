import * as React from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Bug, Check, Mail, Scale, Send, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label, Textarea } from '@/components/ui/input'
import { CapabilityNotice, PageHeader, SectionHeader } from '@/components/feedback'

/**
 * Where reports go.
 *
 * Deliberately not a credential-gated feature: it is a published address, and
 * the page says out loud when it is still a placeholder.
 */
const CONTACT_EMAIL = import.meta.env.VITE_CONTACT_EMAIL || 'hello@hackradar.example'

const CATEGORIES = [
  { key: 'bad-data', label: 'Incorrect or stale listing', icon: AlertTriangle, blurb: 'Wrong dates, a cancelled event, a misread prize pool.' },
  { key: 'missing-event', label: 'A hackathon is missing', icon: Bug, blurb: 'It is public and not in the catalogue.' },
  { key: 'removal', label: 'Rights holder takedown request', icon: Trash2, blurb: 'Content should be removed from HackRadar.' },
  { key: 'privacy', label: 'Privacy or data deletion', icon: Scale, blurb: 'Export or deletion of your account data.' },
  { key: 'other', label: 'Something else', icon: Mail, blurb: 'Feedback, bugs, corrections, anything at all.' },
]

/**
 * Contact.
 *
 * There is no backend mail relay in the zero-config deployment, so the form
 * composes a prefilled message and hands it to the visitor's own mail client.
 * That is honest about the mechanism — nothing is claimed to be sent that is not.
 */
export default function ContactPage() {
  const [topic, setTopic] = React.useState('bad-data')
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [link, setLink] = React.useState('')
  const [details, setDetails] = React.useState('')
  const [copied, setCopied] = React.useState(false)

  const address = CONTACT_EMAIL

  const message = React.useMemo(() => {
    const lines = [
      `Topic: ${CATEGORIES.find((c) => c.key === topic)?.label ?? topic}`,
      `From: ${name || '(your name)'}`,
      `Email: ${email || '(your email)'}`,
      link ? `Link to the listing: ${link}` : null,
      '',
      details || '(your message)',
      '',
      '— Sent from the HackRadar contact form',
    ].filter(Boolean)
    return lines.join('\n')
  }, [topic, name, email, link, details])

  const mailto = `mailto:${address}?subject=${encodeURIComponent(
    `[HackRadar] ${CATEGORIES.find((c) => c.key === topic)?.label ?? topic}`,
  )}&body=${encodeURIComponent(message)}`

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader
        kicker="Contact"
        title="Tell HackRadar what is wrong"
        description="Bad data is the main failure mode of an aggregator, and it is worth reporting. Every correction improves the catalogue for everyone."
      />

      <CapabilityNotice className="mt-8" title="How this form actually works">
        There is no mail relay in a zero-configuration deployment, so this form does not transmit anything on
        its own. It composes a complete, pre-filled message and hands it to your own email client when you
        press send — or you can copy it and use whatever channel you prefer. Nothing is stored or logged by
        HackRadar.
      </CapabilityNotice>

      <div className="mt-10 space-y-10">
        <section>
          <SectionHeader kicker="Step 1" title="What is this about?" />
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {CATEGORIES.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setTopic(option.key)}
                aria-pressed={topic === option.key}
                className={`flex items-start gap-3 border-[3px] border-black p-4 text-left transition-colors ${
                  topic === option.key ? 'bg-black text-white' : 'bg-white hover:bg-ash'
                }`}
              >
                <option.icon className="mt-0.5 size-5 shrink-0 stroke-[2.5]" aria-hidden />
                <span>
                  <span className="block font-display text-base uppercase leading-none tracking-[-0.02em]">
                    {option.label}
                  </span>
                  <span
                    className={`mt-1.5 block text-xs leading-relaxed ${topic === option.key ? 'text-ash' : 'text-soot'}`}
                  >
                    {option.blurb}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <SectionHeader kicker="Step 2" title="Details" />
          <Card className="mt-5 space-y-4 p-5 shadow-brutal">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="contact-name">Your name</Label>
                <input
                  id="contact-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={80}
                  className="mt-2 h-11 w-full border-[3px] border-black bg-white px-3 font-mono text-sm outline-none placeholder:text-concrete focus:ring-4 focus:ring-black"
                  placeholder="Optional"
                />
              </div>
              <div>
                <Label htmlFor="contact-email">Your email</Label>
                <input
                  id="contact-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  maxLength={200}
                  className="mt-2 h-11 w-full border-[3px] border-black bg-white px-3 font-mono text-sm outline-none placeholder:text-concrete focus:ring-4 focus:ring-black"
                  placeholder="So a correction can be confirmed"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="contact-link">Link to the hackathon or source</Label>
              <input
                id="contact-link"
                value={link}
                onChange={(event) => setLink(event.target.value)}
                maxLength={500}
                className="mt-2 h-11 w-full border-[3px] border-black bg-white px-3 font-mono text-sm outline-none placeholder:text-concrete focus:ring-4 focus:ring-black"
                placeholder="https://…"
              />
            </div>

            <div>
              <Label htmlFor="contact-details">What is wrong, or what should be added?</Label>
              <Textarea
                id="contact-details"
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                rows={6}
                maxLength={4000}
                className="mt-2"
                placeholder="Be specific: which dates are wrong, what the official page says, and what the correct value is."
              />
            </div>

            <div className="flex flex-wrap gap-3 border-t-[3px] border-black pt-4">
              <Button asChild>
                <a href={mailto}>
                  <Send /> Open in my email client
                </a>
              </Button>
              <Button variant="outline" onClick={copyMessage}>
                {copied ? <Check /> : null}
                {copied ? 'Copied' : 'Copy the message'}
              </Button>
            </div>

            <details className="border-2 border-ash bg-ash px-3 py-2">
              <summary className="cursor-pointer font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
                Preview the composed message
              </summary>
              <pre className="mt-3 whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-soot">
                {message}
              </pre>
            </details>
          </Card>
        </section>

        <section>
          <SectionHeader kicker="Before you write" title="Faster routes to a fix" />
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {[
              {
                title: 'Listing shows wrong dates',
                body: 'Open the hackathon page — the Dates tab shows exactly what HackRadar stored and when it was last re-verified. Include that in your report.',
                to: '/explore',
              },
              {
                title: 'A source is failing',
                body: 'The Data Sources page shows recent per-source sync results, so you can tell a data problem from a broken feed.',
                to: '/data-sources',
              },
              {
                title: 'Account deletion',
                body: 'Delete saved ideas and notifications yourself from Settings. Full account deletion needs this form.',
                to: '/settings',
              },
            ].map((item) => (
              <Card key={item.title} className="flex flex-col p-5 shadow-brutal">
                <h3 className="font-display text-base uppercase leading-none tracking-[-0.02em]">{item.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-soot">{item.body}</p>
                <Link
                  to={item.to}
                  className="mt-auto pt-4 font-mono text-[10px] font-bold uppercase tracking-[0.14em] underline decoration-[3px] underline-offset-4 hover:no-underline"
                >
                  Open →
                </Link>
              </Card>
            ))}
          </div>
        </section>

        <Card className="p-5 shadow-brutal">
          <p className="brutal-kicker">Configured contact address</p>
          <p className="mt-3 flex items-center gap-2 font-mono text-sm">
            <Mail className="size-4 stroke-[3]" aria-hidden />
            {address}
          </p>
          {import.meta.env.VITE_CONTACT_EMAIL ? null : (
            <p className="mt-3 text-xs leading-relaxed text-soot">
              This deployment has no contact address configured, so the address above is a placeholder. Set{' '}
              <code className="border-2 border-black px-1 font-mono">VITE_CONTACT_EMAIL</code> in{' '}
              <code className="border-2 border-black px-1 font-mono">.env</code> and rebuild to publish a real
              address.
            </p>
          )}
        </Card>
      </div>
    </div>
  )
}