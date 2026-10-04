import * as React from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Bell, Bookmark, Lightbulb, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { HackathonCard } from '@/components/hackathon-card'
import { DeadlineList, SavedIdeasPanel } from '@/pages/bookmarks'
import {
  CapabilityNotice,
  EmptyState,
  ErrorState,
  PageHeader,
  SectionHeader,
  StatTile,
} from '@/components/feedback'
import { Stagger, StaggerItem } from '@/components/motion'
import { useAuth } from '@/hooks/use-auth'
import { useNotifications } from '@/hooks/use-notifications'
import { api } from '@/lib/api'
import { relativeTime } from '@/lib/format'

/**
 * Personal dashboard.
 *
 * One request (`/api/me/dashboard`) returns everything: bookmark rollup,
 * deadline countdown, saved ideas, recent notifications and recommendations
 * scored against what the user has actually bookmarked.
 */
export default function DashboardPage({ meta }) {
  const { user, profile } = useAuth()
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(null)
  const { refreshUnread } = useNotifications()

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const result = await api.dashboard()
      setData(result)
      setError(null)
      refreshUnread()
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [refreshUnread])

  React.useEffect(() => {
    load()
  }, [load])

  const deleteIdea = async (idea) => {
    setData((prev) => ({
      ...prev,
      projectIdeas: (prev?.projectIdeas ?? []).filter((i) => i.id !== idea.id),
      stats: { ...prev.stats, ideas: Math.max(0, (prev.stats?.ideas ?? 1) - 1) },
    }))
    try {
      await api.deleteIdea(idea.id)
      toast('Idea deleted.')
    } catch {
      toast.error('Could not delete that idea.')
      load()
    }
  }

  const firstName = (profile?.displayName ?? user?.displayName ?? user?.email ?? '').split('@')[0]
  const stats = data?.stats ?? {}

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6 sm:py-14">
      <PageHeader
        kicker="Your dashboard"
        title={firstName ? `Hi, ${firstName}` : 'Your dashboard'}
        description="Everything you have saved, what needs a decision next, and what HackRadar found that looks like it matches you."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={loading ? 'animate-spin' : undefined} /> Refresh
            </Button>
            <Button asChild>
              <Link to="/explore">
                Explore <ArrowRight />
              </Link>
            </Button>
          </div>
        }
      />

      {error ? <ErrorState className="mt-8" title="Could not load your dashboard" error={error} onRetry={load} /> : null}

      {loading && !data ? (
        <div className="mt-8 h-64 border-[3px] border-black bg-ash" aria-hidden />
      ) : data ? (
        <>
          <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile value={stats.bookmarks ?? 0} label="Bookmarks" to="/bookmarks" hint="Saved hackathons" />
            <StatTile value={stats.ideas ?? 0} label="Saved ideas" hint="Project ideas you kept" />
            <StatTile
              value={stats.unreadNotifications ?? 0}
              label="Unread"
              to="/notifications"
              hint="Polls every 60 seconds"
            />
            <StatTile
              value={stats.activeSubscriptions ?? 0}
              label="Subscriptions"
              to="/settings"
              hint="Active alert categories"
            />
          </div>

          <div className="mt-10 grid gap-8 lg:grid-cols-[1.35fr_1fr] lg:items-start">
            <div className="min-w-0 space-y-10">
              {/* ------------------------------------------- deadlines -- */}
              <section>
                <SectionHeader
                  kicker="Act on these"
                  title="Deadlines closing"
                  description="Registration deadlines from the hackathons you bookmarked, soonest first."
                />
                <Card className="mt-5 px-4 shadow-brutal">
                  <DeadlineList
                    items={data.upcomingDeadlines}
                    emptyText="None of your bookmarked hackathons has a published registration deadline in the future."
                  />
                </Card>
              </section>

              {/* ------------------------------------------- suggestions -- */}
              <section>
                <SectionHeader
                  kicker="Picked for you"
                  title="More like your bookmarks"
                  description="Scored on shared categories, technologies, open registration and how soon they start. No tracking, no ad profile — just what you saved."
                />
                <div className="mt-5">
                  {(data.suggestions ?? []).length === 0 ? (
                    <EmptyState
                      title="Not enough signal yet"
                      description="Bookmark a couple of hackathons and HackRadar can suggest matches. Until then there is nothing honest to recommend."
                      action={
                        <Button asChild variant="outline">
                          <Link to="/explore">
                            Find something to bookmark <ArrowRight />
                          </Link>
                        </Button>
                      }
                    />
                  ) : (
                    <Stagger className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                      {(data.suggestions ?? []).slice(0, 4).map((hackathon) => (
                        <StaggerItem key={hackathon.id}>
                          <HackathonCard hackathon={hackathon} />
                        </StaggerItem>
                      ))}
                    </Stagger>
                  )}
                </div>
              </section>

              {/* ------------------------------------------- bookmarks -- */}
              <section>
                <SectionHeader
                  kicker="Saved"
                  title="Your bookmarks"
                  action={
                    <Button asChild variant="outline">
                      <Link to="/bookmarks">
                        Manage all <ArrowRight />
                      </Link>
                    </Button>
                  }
                />
                <div className="mt-5">
                  {(data.bookmarks ?? []).length === 0 ? (
                    <EmptyState
                      icon={Bookmark}
                      title="No bookmarks yet"
                      description="Save anything from the catalogue and it appears here."
                    />
                  ) : (
                    <Stagger className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                      {(data.bookmarks ?? []).slice(0, 4).map((hackathon) => (
                        <StaggerItem key={hackathon.id}>
                          <HackathonCard hackathon={hackathon} compact isBookmarked />
                        </StaggerItem>
                      ))}
                    </Stagger>
                  )}
                </div>
              </section>
            </div>

            {/* ------------------------------------------------- side -- */}
            <aside className="space-y-6">
              <Card className="shadow-brutal">
                <div className="flex items-center gap-3 border-b-[3px] border-black bg-black px-4 py-3">
                  <Bell className="size-4 stroke-[2.5] text-white" aria-hidden />
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-white">
                    Recent notifications
                  </p>
                </div>
                <ul>
                  {(data.recentNotifications ?? []).length === 0 ? (
                    <li className="px-4 py-6 text-center text-sm text-soot">
                      Nothing yet.{' '}
                      <Link
                        to="/settings"
                        className="underline decoration-[2px] underline-offset-2 hover:no-underline"
                      >
                        Subscribe to a category
                      </Link>{' '}
                      to start getting them.
                    </li>
                  ) : (
                    data.recentNotifications.map((item) => (
                      <li key={item.id} className="border-b-2 border-ash px-4 py-3 last:border-b-0">
                        <p
                          className={`font-mono text-[11px] font-bold uppercase tracking-[0.1em] ${
                            item.readAt ? 'text-soot' : 'text-black'
                          }`}
                        >
                          {item.title}
                        </p>
                        {item.body ? <p className="mt-1 text-xs leading-relaxed text-soot">{item.body}</p> : null}
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-concrete">
                          {relativeTime(item.createdAt)}
                        </p>
                      </li>
                    ))
                  )}
                </ul>
              </Card>

              <Card className="p-5 shadow-brutal">
                <p className="brutal-kicker flex items-center gap-1.5">
                  <Lightbulb className="size-3.5 stroke-[3]" aria-hidden /> Saved project ideas
                </p>
                <SavedIdeasPanel
                  className="mt-4"
                  ideas={(data.projectIdeas ?? []).slice(0, 4)}
                  onDelete={deleteIdea}
                />
                <Button asChild variant="outline" className="mt-4 w-full">
                  <Link to="/ideas">
                    Generate new ideas <ArrowRight />
                  </Link>
                </Button>
              </Card>

              <CapabilityNotice title="What HackRadar stores about you">
                An email address (only if you signed up), a display name if you set one, your bookmarks, your
                saved ideas and your notification preferences. Nothing is sold or shared with the platforms
                HackRadar reads. Delete everything from{' '}
                <Link to="/settings" className="underline decoration-[2px] underline-offset-2">
                  settings
                </Link>
                .
              </CapabilityNotice>
            </aside>
          </div>
        </>
      ) : null}

      {meta?.sync?.lastRefreshedAt ? (
        <p className="mt-12 border-t-[3px] border-black pt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-concrete">
          Catalogue last refreshed {relativeTime(meta.sync.lastRefreshedAt)} · recommendations are recomputed each
          time you open this page.
        </p>
      ) : null}
    </div>
  )
}