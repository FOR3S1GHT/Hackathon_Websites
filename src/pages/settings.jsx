import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, LogOut, Save, Trash2, User } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Label, Switch } from '@/components/ui/input'
import { CapabilityNotice, DataRow, PageHeader, SectionHeader } from '@/components/feedback'
import { useAuth } from '@/hooks/use-auth'
import { api } from '@/lib/api'
import { CATEGORY_LIST, TECHNOLOGY_LIST } from '@/lib/taxonomy-labels'
import { cn } from '@/lib/utils'

const SUBSCRIPTION_LABELS = {
  deadline_soon: 'Registration deadlines on bookmarked hackathons',
  new_match: 'New hackathons in my subscribed categories',
  daily_digest: 'Daily digest of everything discovered',
}

/**
 * Settings: profile, interests, notification subscriptions, and deletion.
 *
 * Interests stored here feed both the dashboard's recommendations and the
 * notification matcher. Both are opt-in and clearable at any time.
 */
export default function SettingsPage() {
  const { user, profile, isSupabase, signOut, refreshProfile } = useAuth()
  const navigate = useNavigate()

  const [displayName, setDisplayName] = React.useState('')
  const [savingProfile, setSavingProfile] = React.useState(false)
  const [profileError, setProfileError] = React.useState(null)

  const [categories, setCategories] = React.useState([])
  const [technologies, setTechnologies] = React.useState([])
  const [savingInterests, setSavingInterests] = React.useState(false)

  const [subs, setSubs] = React.useState({})
  const [subsBusy, setSubsBusy] = React.useState(null)

  React.useEffect(() => {
    setDisplayName(profile?.displayName ?? user?.displayName ?? '')
    setCategories(profile?.preferredCategories ?? [])
    setTechnologies(profile?.preferredTechnologies ?? [])
  }, [profile, user])

  React.useEffect(() => {
    api
      .subscriptions()
      .then((data) => {
        const map = {}
        for (const entry of data?.items ?? []) map[entry.type] = entry
        setSubs(map)
      })
      .catch(() => {})
  }, [])

  const saveProfile = async (event) => {
    event.preventDefault()
    setSavingProfile(true)
    setProfileError(null)
    try {
      await api.updateMe({ displayName: displayName.trim() || null })
      await refreshProfile()
      toast.success('Profile updated.')
    } catch (err) {
      setProfileError(err)
      toast.error(err?.message ?? 'Could not save your profile.')
    } finally {
      setSavingProfile(false)
    }
  }

  const saveInterests = async (patch) => {
    setSavingInterests(true)
    try {
      const body = {
        preferredCategories: patch.categories ?? categories,
        preferredTechnologies: patch.technologies ?? technologies,
      }
      await api.updateMe(body)
      setCategories(body.preferredCategories)
      setTechnologies(body.preferredTechnologies)
      toast.success('Interests saved.')
    } catch (err) {
      toast.error(err?.message ?? 'Could not save your interests.')
    } finally {
      setSavingInterests(false)
    }
  }

  const toggleSubscription = async (type, active) => {
    setSubsBusy(type)
    // Optimistic: flip locally, revert on failure.
    const previous = subs[type]
    setSubs((prev) => ({
      ...prev,
      [type]: { ...(previous ?? { type }), type, active },
    }))
    try {
      if (active) {
        const result = await api.setSubscription(type, { active: true, subscriptionData: {} })
        setSubs((prev) => ({ ...prev, [type]: result.subscription }))
      } else {
        await api.deleteSubscription(type)
        setSubs((prev) => {
          const next = { ...prev }
          delete next[type]
          return next
        })
      }
    } catch (err) {
      setSubs((prev) => ({ ...prev, [type]: previous }))
      toast.error(err?.message ?? 'Could not update that subscription.')
    } finally {
      setSubsBusy(null)
    }
  }

  const toggleIn = (list, value) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value]

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader
        kicker="Settings"
        title="Your account"
        description="Profile, interests and alert subscriptions. All of it is stored in your own account and can be removed at any time."
      />

      <div className="mt-10 space-y-12">
        {/* -------------------------------------------------------- profile -- */}
        <section>
          <SectionHeader kicker="Profile" title="Who you are" />
          <Card className="mt-5 p-5 shadow-brutal">
            <form onSubmit={saveProfile} className="space-y-4">
              <div>
                <Label htmlFor="display-name">Display name</Label>
                <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                  <Input
                    id="display-name"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="Shown on your saved ideas"
                    maxLength={80}
                    className="flex-1"
                  />
                  <Button type="submit" disabled={savingProfile}>
                    <Save /> {savingProfile ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </div>

              <dl className="border-t-[3px] border-black pt-2">
                <DataRow label="Email" value={user?.email ?? '—'} />
                <DataRow label="Sign-in method" value={isSupabase ? 'Supabase Auth' : 'HackRadar local accounts'} />
                <DataRow label="User ID" value={<span className="break-all">{user?.id}</span>} />
              </dl>

              {isSupabase ? (
                <p className="text-xs leading-relaxed text-soot">
                  Password changes, email confirmation and account recovery are handled by Supabase Auth. Use
                  the &ldquo;forgot password&rdquo; link on the sign-in page to reset it.
                </p>
              ) : (
                <CapabilityNotice title="Local accounts" tone="plain">
                  No Supabase credentials are configured, so HackRadar is using its own account system:
                  scrypt password hashing and an httpOnly, SameSite=Lax session cookie. Passwords never leave
                  this server and are never stored in plain text. Deploying with Supabase is recommended for
                  production.
                </CapabilityNotice>
              )}

              {profileError ? (
                <p className="border-[3px] border-black bg-ash px-3 py-2 text-sm font-bold">
                  {profileError.message}
                </p>
              ) : null}
            </form>

            <div className="mt-5 border-t-[3px] border-black pt-5">
              <Button
                variant="outline"
                onClick={async () => {
                  await signOut()
                  toast('Signed out.')
                  navigate('/')
                }}
              >
                <LogOut /> Sign out
              </Button>
            </div>
          </Card>
        </section>

        {/* ------------------------------------------------------ interests -- */}
        <section>
          <SectionHeader
            kicker="Interests"
            title="What you care about"
            description="Used only to rank dashboard suggestions and to decide which notifications match. Never sold, never shared with source platforms."
          />
          <Card className="mt-5 p-5 shadow-brutal">
            <fieldset>
              <legend className="brutal-kicker">Categories</legend>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {CATEGORY_LIST.map((category) => {
                  const on = categories.includes(category.key)
                  return (
                    <button
                      key={category.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => saveInterests({ categories: toggleIn(categories, category.key) })}
                      className={cn(
                        'border-2 border-black px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] transition-colors',
                        on ? 'bg-black text-white' : 'bg-white hover:bg-ash',
                      )}
                    >
                      {category.label}
                    </button>
                  )
                })}
              </div>
            </fieldset>

            <fieldset className="mt-8">
              <legend className="brutal-kicker">Technologies</legend>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {TECHNOLOGY_LIST.map((tech) => {
                  const on = technologies.includes(tech.label)
                  return (
                    <button
                      key={tech.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => saveInterests({ technologies: toggleIn(technologies, tech.label) })}
                      className={cn(
                        'border-2 border-black px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em] transition-colors',
                        on ? 'bg-black text-white' : 'bg-white hover:bg-ash',
                      )}
                    >
                      {tech.label}
                    </button>
                  )
                })}
              </div>
            </fieldset>

            {savingInterests ? (
              <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.14em]" role="status">
                Saving…
              </p>
            ) : null}
          </Card>
        </section>

        {/* ------------------------------------------------- subscriptions -- */}
        <section>
          <SectionHeader
            kicker="Alerts"
            title="Notification subscriptions"
            description="Each switch is independent and off by default. Turning one on never sends anything immediately."
          />
          <Card className="mt-5 p-5 shadow-brutal">
            <ul className="divide-y-2 divide-ash">
              {Object.entries(SUBSCRIPTION_LABELS).map(([type, label]) => {
                const entry = subs[type]
                const active = entry?.active === true
                return (
                  <li key={type} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-display text-base uppercase leading-tight tracking-[-0.02em]">
                        {label}
                        {active ? (
                          <Badge variant="solid" size="sm">
                            <Check className="size-3" /> On
                          </Badge>
                        ) : null}
                      </p>
                      {type === 'daily_digest' ? (
                        <p className="mt-1 text-xs leading-relaxed text-soot">
                          A single email listing everything HackRadar discovered in the last 24 hours.
                        </p>
                      ) : type === 'deadline_soon' ? (
                        <p className="mt-1 text-xs leading-relaxed text-soot">
                          Sent once per bookmarked hackathon, 7 days before its published registration deadline.
                        </p>
                      ) : (
                        <p className="mt-1 text-xs leading-relaxed text-soot">
                          Fired when a newly discovered hackathon matches a category or technology you
                          selected above.
                        </p>
                      )}
                    </div>
                    <Switch
                      checked={active}
                      disabled={subsBusy === type}
                      onCheckedChange={(value) => toggleSubscription(type, value)}
                      aria-label={`${active ? 'Disable' : 'Enable'}: ${label}`}
                    />
                  </li>
                )
              })}
            </ul>
            <Button asChild variant="outline" className="mt-5">
              <Link to="/notifications">Open the notification centre</Link>
            </Button>
          </Card>
        </section>

        {/* -------------------------------------------------------- danger -- */}
        <section>
          <SectionHeader kicker="Data" title="Delete your data" />
          <Card className="mt-5 border-[3px] border-black bg-black p-5 text-white shadow-brutal-lg">
            <p className="text-sm leading-relaxed text-ash">
              HackRadar can delete your bookmarks, saved ideas, notifications and preferences immediately.
              Your account record itself is removed by the auth provider (
              {isSupabase ? 'Supabase' : 'the local account store'}) — for a full deletion including the
              account, use the contact form and it will be actioned within 30 days.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button
                variant="outline"
                className="border-white bg-white text-black hover:bg-white"
                onClick={async () => {
                  if (!window.confirm('Delete every saved idea? This cannot be undone.')) return
                  const items = (await api.ideas().catch(() => ({ items: [] })))?.items ?? []
                  for (const idea of items) await api.deleteIdea(idea.id).catch(() => null)
                  toast(`Deleted ${items.length} saved idea(s).`)
                }}
              >
                <Trash2 /> Delete saved ideas
              </Button>
              <Button
                variant="outline"
                className="border-white bg-black text-white hover:bg-white hover:text-black"
                onClick={async () => {
                  if (!window.confirm('Clear all notifications? This cannot be undone.')) return
                  await api.clearNotifications().catch(() => null)
                  toast('Notifications cleared.')
                }}
              >
                <Trash2 /> Clear notifications
              </Button>
            </div>
          </Card>
        </section>

        <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-concrete">
          <User className="size-3 stroke-[3]" aria-hidden />
          Signed in as {user?.email}
        </p>
      </div>
    </div>
  )
}