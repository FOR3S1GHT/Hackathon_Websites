import * as React from 'react'
import { Link } from 'react-router-dom'
import {
  Bell,
  BellOff,
  CheckCheck,
  ExternalLink,
  Inbox,
  Mail,
  RadioTower,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label, Switch } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CapabilityNotice, EmptyState, ErrorState, PageHeader, SectionHeader } from '@/components/feedback'
import { useAuth } from '@/hooks/use-auth'
import { useNotifications, usePushNotifications } from '@/hooks/use-notifications'
import { useRealtime } from '@/hooks/use-realtime'
import { api } from '@/lib/api'
import { relativeTime } from '@/lib/format'

const KIND_LABEL = {
  deadline_soon: 'Deadline closing',
  new_match: 'New match',
  digest: 'Daily digest',
  system: 'System',
}

function NotificationRow({ item, onRead }) {
  const unread = !item.readAt
  return (
    <li
      className={`border-b-2 border-ash last:border-b-0 ${unread ? 'bg-ash' : 'bg-white'}`}
    >
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={unread ? 'solid' : 'ash'}>{KIND_LABEL[item.kind] ?? item.kind}</Badge>
            {unread ? (
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">New</span>
            ) : null}
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-concrete">
              {relativeTime(item.createdAt)}
            </span>
          </div>
          <h3 className="mt-2 font-display text-base uppercase leading-tight tracking-[-0.02em]">
            {item.title}
          </h3>
          {item.body ? <p className="mt-1.5 text-sm leading-relaxed text-soot">{item.body}</p> : null}

          {item.hackathonSlug || item.url ? (
            <Link
              to={item.hackathonSlug ? `/hackathon/${item.hackathonSlug}` : item.url}
              className="mt-2.5 inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] underline decoration-[3px] underline-offset-4 hover:no-underline"
            >
              View the hackathon <ExternalLink className="size-3 stroke-[3]" />
            </Link>
          ) : null}
        </div>

        {unread ? (
          <Button size="sm" variant="outline" onClick={() => onRead(item)} className="shrink-0">
            Mark read
          </Button>
        ) : null}
      </div>
    </li>
  )
}

/**
 * Notification centre.
 *
 * Three channels, each labelled with its real delivery guarantee:
 *  - in-app: always on, SSE-backed;
 *  - push:    needs explicit browser permission AND VAPID keys on the server;
 *  - email:   needs SMTP/Resend credentials on the server.
 *
 * Everything is opt-in. Nothing is subscribed on page load.
 */
export default function NotificationsPage() {
  const { isAuthenticated } = useAuth()
  const { items, unread, loading, error, preferences, reload, markRead, markAllRead, clearAll } =
    useNotifications()
  const push = usePushNotifications()
  const [busy, setBusy] = React.useState(false)

  // The server pushes a notification event; refresh the list so the badge and
  // the list never disagree.
  useRealtime({
    onNotification: () => {
      reload()
    },
  })

  const [draftPrefs, setDraftPrefs] = React.useState(null)
  React.useEffect(() => {
    if (preferences?.preferences) setDraftPrefs(preferences.preferences)
  }, [preferences])

  const savePrefs = async (patch) => {
    if (!isAuthenticated) return
    const next = { ...(draftPrefs ?? {}), ...patch }
    setDraftPrefs(next)
    setBusy(true)
    try {
      await api.updateMe({ notificationPreferences: next })
      toast.success('Notification preferences saved.')
    } catch (err) {
      toast.error(err?.message ?? 'Could not save your preferences.')
      reload()
    } finally {
      setBusy(false)
    }
  }

  const caps = preferences?.capabilities ?? { inApp: true, push: false, email: false }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader
        kicker="Notification centre"
        title="Notifications"
        description="Deadlines closing, newly discovered matches, and digests. Every channel is opt-in and can be switched off here at any time."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={markAllRead} disabled={unread === 0}>
              <CheckCheck /> Mark all read
            </Button>
            <Button variant="ghost" onClick={clearAll} disabled={items.length === 0}>
              <Trash2 /> Clear all
            </Button>
          </div>
        }
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-[3px] border-black pb-3">
            <p className="font-mono text-xs uppercase tracking-[0.14em]" role="status" aria-live="polite">
              {loading ? 'Loading…' : `${unread} unread · ${items.length} total`}
            </p>
            <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-concrete">
              <RadioTower className="size-3 stroke-[3]" aria-hidden />
              Badge refreshes on focus and every 60 seconds — it is not instant
            </p>
          </div>

          {error ? (
            <ErrorState className="mt-6" title="Could not load notifications" error={error} onRetry={reload} />
          ) : loading ? (
            <div className="mt-6 space-y-2" aria-hidden>
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-24 border-[3px] border-ash bg-ash" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              className="mt-6"
              icon={Inbox}
              title="Nothing to read"
              description="You have no notifications yet. Subscribe to a category below and HackRadar will tell you when something relevant appears or a saved deadline is closing."
            />
          ) : (
            <ul className="mt-6 border-[3px] border-black bg-white shadow-brutal">
              {items.map((item) => (
                <NotificationRow key={item.id} item={item} onRead={markRead} />
              ))}
            </ul>
          )}
        </div>

        <aside className="space-y-5">
          {/* ------------------------------------------------------ in-app -- */}
          <Card className="shadow-brutal">
            <div className="flex items-center gap-3 border-b-[3px] border-black bg-black px-4 py-3">
              <Bell className="size-4 stroke-[2.5] text-white" aria-hidden />
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-white">
                In-app · always available
              </p>
            </div>
            <div className="space-y-4 p-4">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="pref-inapp" className="brutal-kicker">
                  In-app notifications
                </Label>
                <Switch
                  id="pref-inapp"
                  checked={draftPrefs?.inApp !== false}
                  onCheckedChange={(value) => savePrefs({ inApp: value })}
                  disabled={busy}
                />
              </div>
              <p className="text-xs leading-relaxed text-soot">
                {preferences?.explanations?.inApp ??
                  'Appear in this centre and update live over a server-sent event stream.'}
              </p>
            </div>
          </Card>

          {/* -------------------------------------------------------- push -- */}
          <Card className="shadow-brutal">
            <div className="flex items-center gap-3 border-b-[3px] border-black bg-ash px-4 py-3">
              <RadioTower className="size-4 stroke-[2.5]" aria-hidden />
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]">Browser push</p>
            </div>
            <div className="space-y-4 p-4">
              {!caps.push ? (
                <CapabilityNotice title="Not configured on this server" tone="plain">
                  Web Push needs VAPID keys. Generate them with{' '}
                  <code className="border-2 border-black px-1 font-mono">npx web-push generate-vapid-keys</code>{' '}
                  and set <code className="border-2 border-black px-1 font-mono">VAPID_PUBLIC_KEY</code> and{' '}
                  <code className="border-2 border-black px-1 font-mono">VAPID_PRIVATE_KEY</code>. Nothing was
                  requested from your browser.
                </CapabilityNotice>
              ) : null}

              {!push.supported ? (
                <p className="text-xs leading-relaxed text-soot">
                  This browser cannot receive push notifications (no service worker or PushManager support).
                </p>
              ) : push.permission === 'denied' ? (
                <CapabilityNotice title="Blocked by the browser" tone="plain">
                  You previously blocked notifications for this site. Re-enable them in your browser&rsquo;s site
                  settings, then try again. HackRadar will not ask again on its own.
                </CapabilityNotice>
              ) : (
                <>
                  <Button
                    onClick={() =>
                      (push.subscribed || push.permission === 'granted' ? push.disable() : push.enable()).catch(
                        (err) => toast.error(err.message),
                      )
                    }
                    disabled={push.busy || !caps.push}
                    variant={push.subscribed ? 'outline' : 'default'}
                    className="w-full"
                  >
                    {push.subscribed ? 'Turn off push' : 'Turn on push'}
                  </Button>
                  {push.permission === 'granted' && caps.push ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      onClick={() =>
                        api
                          .testPush()
                          .then((result) => toast.success(`Sent to ${result.sent ?? 1} device(s).`))
                          .catch((err) => toast.error(err.message))
                      }
                    >
                      Send a test notification
                    </Button>
                  ) : null}
                  <p className="text-xs leading-relaxed text-soot">
                    {preferences?.explanations?.push ??
                      'Requires your explicit permission and works while HackRadar is closed.'}
                  </p>
                  {push.error ? <p className="text-xs font-bold">{push.error.message}</p> : null}
                </>
              )}
            </div>
          </Card>

          {/* ------------------------------------------------------- email -- */}
          <Card className="shadow-brutal">
            <div className="flex items-center gap-3 border-b-[3px] border-black bg-ash px-4 py-3">
              <Mail className="size-4 stroke-[2.5]" aria-hidden />
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]">Email digests</p>
            </div>
            <div className="space-y-4 p-4">
              {!caps.email ? (
                <CapabilityNotice title="Not configured on this server" tone="plain">
                  Email delivery needs SMTP credentials or a Resend key. Set{' '}
                  <code className="border-2 border-black px-1 font-mono">EMAIL_PROVIDER</code> plus{' '}
                  <code className="border-2 border-black px-1 font-mono">SMTP_*</code> or{' '}
                  <code className="border-2 border-black px-1 font-mono">RESEND_API_KEY</code>. No email address
                  is used until you subscribe.
                </CapabilityNotice>
              ) : null}
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="pref-email" className="brutal-kicker">
                  Allow email
                </Label>
                <Switch
                  id="pref-email"
                  checked={draftPrefs?.email === true}
                  onCheckedChange={(value) => savePrefs({ email: value })}
                  disabled={busy || !caps.email}
                />
              </div>
              <p className="text-xs leading-relaxed text-soot">
                Off by default. Turn it on, then pick categories on your{' '}
                <Link to="/settings" className="underline decoration-[2px] underline-offset-2">
                  settings page
                </Link>
                . Every email has a one-click unsubscribe link.
              </p>
            </div>
          </Card>

          {/* ------------------------------------------------ quiet hours -- */}
          <Card className="shadow-brutal">
            <div className="flex items-center gap-3 border-b-[3px] border-black bg-ash px-4 py-3">
              <BellOff className="size-4 stroke-[2.5]" aria-hidden />
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]">Quiet hours</p>
            </div>
            <div className="space-y-4 p-4">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="pref-quiet" className="brutal-kicker">
                  Enable quiet hours
                </Label>
                <Switch
                  id="pref-quiet"
                  checked={draftPrefs?.quietHoursEnabled === true}
                  onCheckedChange={(value) => savePrefs({ quietHoursEnabled: value })}
                  disabled={busy}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="quiet-start" className="brutal-kicker">
                    From (UTC hour)
                  </Label>
                  <Select
                    value={String(draftPrefs?.quietHoursStart ?? 22)}
                    onValueChange={(value) => savePrefs({ quietHoursStart: Number(value) })}
                  >
                    <SelectTrigger id="quiet-start" className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, h) => (
                        <SelectItem key={h} value={String(h)}>
                          {String(h).padStart(2, '0')}:00
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="quiet-end" className="brutal-kicker">
                    Until (UTC hour)
                  </Label>
                  <Select
                    value={String(draftPrefs?.quietHoursEnd ?? 7)}
                    onValueChange={(value) => savePrefs({ quietHoursEnd: Number(value) })}
                  >
                    <SelectTrigger id="quiet-end" className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, h) => (
                        <SelectItem key={h} value={String(h)}>
                          {String(h).padStart(2, '0')}:00
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs leading-relaxed text-soot">
                {preferences?.explanations?.quietHours ??
                  'During quiet hours in-app and push alerts are held back. Email is unaffected. Times are UTC.'}
              </p>
            </div>
          </Card>
        </aside>
      </div>

      <section className="mt-16">
        <SectionHeader
          kicker="Frequency"
          title="What actually sends"
          description="HackRadar deduplicates notifications so you never get the same event twice, and never sends anything you did not ask for."
        />
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            { title: 'Deadline closing', body: 'Only for hackathons you bookmarked. Sent once, 7 days before the published registration deadline.' },
            { title: 'New match', body: 'Only for categories and technologies you subscribed to. Deduplicated per event.' },
            { title: 'Daily digest', body: 'Optional summary of everything discovered in the last 24 hours. Off unless you turn it on.' },
          ].map((card) => (
            <Card key={card.title} className="p-5 shadow-brutal">
              <h3 className="font-display text-lg uppercase leading-none tracking-[-0.02em]">{card.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-soot">{card.body}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  )
}