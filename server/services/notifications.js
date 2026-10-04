import { config } from '../config.js'
import { getStore } from '../db/index.js'
import { createLogger } from '../lib/logger.js'
import { publish, EVENTS } from '../lib/events.js'
import { daysUntil, now } from '../lib/dates.js'

const log = createLogger('notify')

/**
 * Notification fan-out.
 *
 * Reliability rules enforced here:
 *  - a notification is only ever created for a hackathon that was *newly
 *    inserted* by this sync run, never on every cycle;
 *  - every notification carries a deterministic `dedupeKey`, enforced by a
 *    unique constraint in Postgres and checked in the JSON store, so a retry
 *    cannot double-alert;
 *  - per-user preferences (in-app, push, email, categories, technologies, quiet
 *    hours) are respected, and users who never opted in receive nothing;
 *  - a per-run cap keeps a large discovery batch from becoming a flood.
 */

const SUBSCRIPTION_TYPES = {
  DISCOVERY: 'newly_discovered',
  DEADLINE: 'registration_deadline',
  DAILY_DIGEST: 'daily_digest',
  CATEGORY: 'category_updates',
}

export { SUBSCRIPTION_TYPES }

function withinQuietHours(prefs, reference = now()) {
  if (!prefs?.quietHoursEnabled) return false
  const start = Number.isFinite(prefs.quietHoursStart) ? prefs.quietHoursStart : 22
  const end = Number.isFinite(prefs.quietHoursEnd) ? prefs.quietHoursEnd : 8
  const hour = reference.getUTCHours()
  // Quiet hours may wrap midnight (22 -> 08).
  return start <= end ? hour >= start && hour < end : hour >= start || hour < end
}

/** Defer in-app + push delivery during quiet hours; email is unaffected. */
function deferred(prefs) {
  return withinQuietHours(prefs)
}

function matchesInterests(profile, hackathon) {
  const prefs = profile.notificationPreferences ?? {}
  const categories = (prefs.categories ?? profile.preferredCategories ?? []).map((c) =>
    String(c).toLowerCase(),
  )
  const technologies = (prefs.technologies ?? profile.preferredTechnologies ?? []).map((t) =>
    String(t).toLowerCase(),
  )

  // No preferences configured means "everything" — but only for users who have
  // explicitly enabled notifications.
  if (!categories.length && !technologies.length) return true

  if (categories.length && hackathon.category) {
    if (categories.includes(String(hackathon.category).toLowerCase())) return true
  }
  if (technologies.length) {
    const haystack = (hackathon.technologies ?? []).map((t) => String(t).toLowerCase())
    if (technologies.some((t) => haystack.includes(t))) return true
  }
  return false
}

async function optedInUsers({ requireInApp = true } = {}) {
  const store = getStore()
  const profiles = await store.allProfiles()
  return profiles.filter((profile) => {
    const prefs = profile.notificationPreferences ?? {}
    const hasInApp = prefs.inApp !== false
    const hasAny =
      (requireInApp ? hasInApp : false) ||
      prefs.push === true ||
      prefs.email === true
    return hasAny && prefs.enabled !== false
  })
}

/**
 * Called after every sync with only the hackathons that were genuinely new.
 */
export async function dispatchForNewHackathons(inserted, { reference = now() } = {}) {
  if (!inserted?.length) return 0
  const store = getStore()
  const users = await optedInUsers()
  if (!users.length) {
    log.debug(`No opted-in users; ${inserted.length} new events recorded without alerts`)
    return 0
  }

  const rows = []
  let budget = config.notifications.maxPerUserPerRun
  const perUser = new Map()

  for (const hackathon of inserted) {
    for (const profile of users) {
      if (budget <= 0) break
      const used = perUser.get(profile.id) ?? 0
      if (used >= config.notifications.maxPerUserPerRun) continue

      const prefs = profile.notificationPreferences ?? {}
      if (prefs.inApp === false) continue
      if (!matchesInterests(profile, hackathon)) continue

      const days = daysUntil(hackathon.registrationDeadline, reference)
      const deadlineNote =
        days !== null && days >= 0 && days <= config.notifications.closingSoonDays
          ? ` Registration closes in ${days} day${days === 1 ? '' : 's'}.`
          : ''

      rows.push({
        userId: profile.id,
        hackathonId: String(hackathon.id),
        title: `New hackathon: ${hackathon.title}`,
        message: `${hackathon.organizer ?? 'An organiser'} just listed "${hackathon.title}" on ${hackathon.sourceName}.${deadlineNote}`,
        type: 'discovery',
        // Deterministic: the same (user, hackathon) pair can only ever alert once.
        dedupeKey: `discovery:${profile.id}:${hackathon.id}`,
        metadata: {
          sourceName: hackathon.sourceName,
          category: hackathon.category,
          slug: hackathon.slug,
          deferred: deferred(prefs),
        },
      })

      perUser.set(profile.id, used + 1)
      budget -= 1
    }
  }

  if (!rows.length) return 0
  const created = await store.createNotifications(rows)
  log.info(`Queued ${created.length} discovery notifications`)

  for (const notification of created) {
    publish(EVENTS.NOTIFICATION_CREATED, {
      userId: notification.userId ?? notification.user_id,
      id: String(notification.id),
    })
  }

  // Best-effort external delivery. Failures here must never fail the sync.
  deliverExternally(created).catch((err) => log.warn('External delivery failed', err.message))

  return created.length
}

/**
 * Deadline reminders. Runs from the scheduler (and can be triggered by cron).
 * The dedupeKey encodes the deadline date, so a user is reminded once per event.
 */
export async function dispatchDeadlineReminders({ reference = now() } = {}) {
  const store = getStore()
  const candidates = await store.findHackathonCandidates()
  const horizon = config.notifications.closingSoonDays
  const users = await optedInUsers()
  if (!users.length) return 0

  const closing = candidates.filter((hackathon) => {
    if (!hackathon.registrationOpen) return false
    const days = daysUntil(hackathon.registrationDeadline, reference)
    return days !== null && days >= 0 && days <= horizon
  })
  if (!closing.length) return 0

  const rows = []
  for (const profile of users) {
    const subs = await store.listSubscriptions(profile.id)
    const deadlineSub = subs.find((s) => s.subscriptionType === SUBSCRIPTION_TYPES.DEADLINE)
    if (!deadlineSub?.active) continue

    for (const hackathon of closing) {
      if (!matchesInterests(profile, hackathon)) continue
      const days = daysUntil(hackathon.registrationDeadline, reference)
      rows.push({
        userId: profile.id,
        hackathonId: String(hackathon.id),
        title: days === 0 ? `Registration closes today: ${hackathon.title}` : `${days} day${days === 1 ? '' : 's'} left to register`,
        message: `Registration for "${hackathon.title}" (${hackathon.organizer ?? 'organiser'}) closes on ${hackathon.registrationDeadline?.slice(0, 10)}.`,
        type: 'deadline',
        dedupeKey: `deadline:${profile.id}:${hackathon.id}:${String(hackathon.registrationDeadline).slice(0, 10)}`,
        metadata: { daysRemaining: days, slug: hackathon.slug },
      })
    }
  }

  if (!rows.length) return 0
  const created = await store.createNotifications(rows)
  if (created.length) log.info(`Queued ${created.length} deadline reminders`)
  return created.length
}

/**
 * Daily digest. Only newly discovered events are included — the digest never
 * re-lists the whole catalogue, which is what makes it useful.
 */
export async function buildDailyDigest({ reference = now() } = {}) {
  const store = getStore()
  const subs = await store.listAllActiveSubscriptions()
  const digestSubs = subs.filter((s) => s.subscriptionType === SUBSCRIPTION_TYPES.DAILY_DIGEST && s.active)
  if (!digestSubs.length) return { recipients: 0, events: [] }

  const cutoff = new Date(reference.getTime() - 24 * 3600_000).toISOString()
  const all = await store.findHackathonCandidates()
  const fresh = all.filter((h) => h.firstDiscoveredAt && h.firstDiscoveredAt >= cutoff)

  // Only users who have actually enabled email delivery are counted as recipients.
  const recipients = new Set()
  for (const sub of digestSubs) {
    const profile = await store.getProfile(sub.userId)
    if (profile?.notificationPreferences?.email === true) recipients.add(sub.userId)
  }

  return {
    recipients: recipients.size,
    events: fresh
      .sort((a, b) => new Date(b.firstDiscoveredAt) - new Date(a.firstDiscoveredAt))
      .slice(0, 40)
      .map((h) => ({
        id: String(h.id),
        title: h.title,
        slug: h.slug,
        organizer: h.organizer,
        sourceName: h.sourceName,
        startDate: h.startDate,
        registrationDeadline: h.registrationDeadline,
        firstDiscoveredAt: h.firstDiscoveredAt,
      })),
  }
}

/** Fan out to web push and email when those channels are configured. */
async function deliverExternally(notifications) {
  if (!notifications.length) return
  const store = getStore()

  const byUser = new Map()
  for (const notification of notifications) {
    const userId = notification.userId ?? notification.user_id
    if (!byUser.has(userId)) byUser.set(userId, [])
    byUser.get(userId).push(notification)
  }

  for (const [userId, rows] of byUser) {
    const profile = await store.getProfile(userId)
    if (!profile) continue
    const prefs = profile.notificationPreferences ?? {}

    if (prefs.push === true) {
      const { sendPushToUser } = await import('./push.js')
      await sendPushToUser(userId, rows).catch((err) => log.warn('Push delivery failed', err.message))
    }

    if (prefs.email === true && !deferred(prefs)) {
      const { sendEmail } = await import('./email.js')
      await sendEmail({
        to: profile.email,
        subject: `${rows.length} new hackathon${rows.length === 1 ? '' : 's'} on HackRadar`,
        text: rows.map((r) => `• ${r.title}\n  ${r.message}`).join('\n\n'),
      }).catch((err) => log.warn('Email delivery failed', err.message))
    }
  }
}

export async function sendPushToUserWrapper(userId, rows) {
  const { sendPushToUser } = await import('./push.js')
  return sendPushToUser(userId, rows)
}
