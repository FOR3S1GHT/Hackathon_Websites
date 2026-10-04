import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { config } from '../config.js'
import { createLogger } from '../lib/logger.js'
import { searchHackathons, buildFacets, aggregateCounts } from '../services/search.js'

const log = createLogger('store:local')

/**
 * Zero-dependency JSON document store.
 *
 * This is the default driver so that `npm run dev` produces a fully working
 * HackRadar with real synchronized data and no external accounts. It is a
 * deliberate trade-off: single-process, whole-file rewrites, no concurrent
 * writers. Set STORE_DRIVER=supabase for multi-instance deployments.
 *
 * Writes are atomic (write temp file -> rename) and debounced so a 500-event
 * sync run performs a handful of disk writes rather than 500.
 */

const COLLECTIONS = [
  'hackathons',
  'profiles',
  'bookmarks',
  'projectIdeas',
  'notifications',
  'notificationSubscriptions',
  'pushSubscriptions',
  'syncLogs',
  'meta',
]

const EMPTY = () => ({
  hackathons: [],
  profiles: [],
  bookmarks: [],
  projectIdeas: [],
  notifications: [],
  notificationSubscriptions: [],
  pushSubscriptions: [],
  syncLogs: [],
  meta: [],
})

class LocalStore {
  constructor(dir) {
    this.dir = dir
    this.file = path.join(dir, 'hackradar-db.json')
    this.data = EMPTY()
    this.dirty = false
    this.flushTimer = null
    this.loading = null
    this.index = {
      hackathonsById: new Map(),
      hackathonsBySlug: new Map(),
      bookmarksByUser: new Map(),
      ideasByUser: new Map(),
      notificationsByUser: new Map(),
      subsByUser: new Map(),
    }
  }

  async init() {
    await this.load()
    this.rebuildIndexes()
    log.info(`Local store ready`, { file: this.file, hackathons: this.data.hackathons.length })
    return this
  }

  async load() {
    if (this.loading) return this.loading
    this.loading = (async () => {
      try {
        if (fs.existsSync(this.file)) {
          const raw = await fsp.readFile(this.file, 'utf8')
          const parsed = JSON.parse(raw)
          this.data = { ...EMPTY(), ...parsed }
          for (const key of COLLECTIONS) {
            if (!Array.isArray(this.data[key])) this.data[key] = []
          }
        }
      } catch (err) {
        log.error('Failed to read local store; starting empty', err)
        this.data = EMPTY()
      }
    })()
    await this.loading
    this.loading = null
  }

  markDirty() {
    this.dirty = true
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      this.flush().catch((err) => log.error('Flush failed', err))
    }, 400)
    // Never hold the process open just for a pending flush.
    if (this.flushTimer.unref) this.flushTimer.unref()
  }

  async flush() {
    if (!this.dirty) return
    this.dirty = false
    const tmp = `${this.file}.${process.pid}.tmp`
    const payload = JSON.stringify(this.data)
    try {
      await fsp.mkdir(this.dir, { recursive: true })
      await fsp.writeFile(tmp, payload, 'utf8')
      await fsp.rename(tmp, this.file)
    } catch (err) {
      this.dirty = true
      log.error('Failed to persist local store', err)
      try {
        await fsp.unlink(tmp)
      } catch {
        /* best effort */
      }
    }
  }

  flushSync() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    if (!this.dirty) return
    this.dirty = false
    try {
      fs.mkdirSync(this.dir, { recursive: true })
      const tmp = `${this.file}.${process.pid}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(this.data), 'utf8')
      fs.renameSync(tmp, this.file)
    } catch (err) {
      log.error('Failed to persist local store (sync)', err)
    }
  }

  rebuildIndexes() {
    this.index.hackathonsById = new Map(this.data.hackathons.map((h) => [String(h.id), h]))
    this.index.hackathonsBySlug = new Map(this.data.hackathons.map((h) => [h.slug, h]))
    this.index.bookmarksByUser = groupBy(this.data.bookmarks, 'userId')
    this.index.ideasByUser = groupBy(this.data.projectIdeas, 'userId')
    this.index.notificationsByUser = groupBy(this.data.notifications, 'userId')
    this.index.subsByUser = groupBy(this.data.notificationSubscriptions, 'userId')
  }

  // ---------------------------------------------------------------- meta --

  async getMeta(key) {
    const row = this.data.meta.find((m) => m.key === key)
    return row ? row.value : null
  }

  async setMeta(key, value) {
    const existing = this.data.meta.find((m) => m.key === key)
    if (existing) {
      existing.value = value
      existing.updatedAt = new Date().toISOString()
    } else {
      this.data.meta.push({ key, value, updatedAt: new Date().toISOString() })
    }
    this.markDirty()
    return value
  }

  // ----------------------------------------------------------- hackathons --

  /**
   * Insert-or-update keyed by (sourceName, sourceEventId). Returns whether the
   * row is new so callers can create discovery notifications.
   */
  async upsertHackathons(records) {
    const nowIso = new Date().toISOString()
    const inserted = []
    const updated = []

    for (const record of records) {
      const key = `${record.sourceName}:${record.sourceEventId}`
      const existing = this.data.hackathons.find(
        (h) => h.sourceName === record.sourceName && h.sourceEventId === record.sourceEventId,
      )

      if (existing) {
        const changed = mergeInto(existing, record, nowIso)
        if (changed) updated.push(existing)
        this.index.hackathonsById.set(String(existing.id), existing)
        this.index.hackathonsBySlug.set(existing.slug, existing)
      } else {
        const id = existing?.id ?? record.id ?? nextId(this.data.hackathons)
        const row = {
          ...record,
          id,
          firstDiscoveredAt: record.firstDiscoveredAt || nowIso,
          createdAt: nowIso,
          updatedAt: nowIso,
          lastVerifiedAt: nowIso,
        }
        this.data.hackathons.push(row)
        this.index.hackathonsById.set(String(id), row)
        this.index.hackathonsBySlug.set(row.slug, row)
        inserted.push(row)
      }
      void key
    }

    this.markDirty()
    return { inserted, updated }
  }

  async getHackathonById(id) {
    return this.index.hackathonsById.get(String(id)) ?? null
  }

  async getHackathonBySlug(slug) {
    return this.index.hackathonsBySlug.get(slug) ?? null
  }

  /** Look up potential cross-source duplicates (used by the dedupe stage). */
  async findHackathonCandidates() {
    return this.data.hackathons
  }

  async markExpired(sourceNames, reference = new Date()) {
    const nowIso = reference.toISOString()
    let count = 0
    for (const hackathon of this.data.hackathons) {
      if (sourceNames && sourceNames.length && !sourceNames.includes(hackathon.sourceName)) continue
      if (hackathon.status === 'completed' || hackathon.status === 'cancelled') continue
      const end = hackathon.endDate || hackathon.registrationDeadline
      if (end && new Date(end) < reference && hackathon.status !== 'cancelled') {
        // Only auto-complete if the event had actually started or ended.
        if (hackathon.startDate && new Date(hackathon.startDate) <= reference) {
          hackathon.status = 'completed'
          hackathon.updatedAt = nowIso
          count += 1
        }
      }
    }
    if (count) this.markDirty()
    return count
  }

  async saveHackathons(hackathons) {
    this.data.hackathons = hackathons
    this.rebuildIndexes()
    this.markDirty()
  }

  async deleteHackathon(id) {
    const before = this.data.hackathons.length
    this.data.hackathons = this.data.hackathons.filter((h) => String(h.id) !== String(id))
    this.rebuildIndexes()
    if (this.data.hackathons.length !== before) this.markDirty()
    return before !== this.data.hackathons.length
  }

  /**
   * The single search entry point. Both drivers implement identical semantics
   * (see services/search.js) so behaviour is consistent whichever store is on.
   */
  async queryHackathons(params) {
    const matched = searchHackathons(this.data.hackathons, params)
    const total = matched.length
    const page = Math.max(1, Number(params.page) || 1)
    const pageSize = Math.min(Math.max(Number(params.pageSize) || 12, 1), 60)
    const start = (page - 1) * pageSize
    const rows = matched.slice(start, start + pageSize)

    const result = {
      items: rows,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      hasMore: start + rows.length < total,
    }
    if (params.includeFacets !== false) {
      result.facets = buildFacets(matched)
      result.globalCounts = aggregateCounts(this.data.hackathons)
    }
    return result
  }

  // ------------------------------------------------------------- profiles --

  async getProfile(userId) {
    return this.data.profiles.find((p) => p.id === userId) ?? null
  }

  async upsertProfile(profile) {
    const existing = this.data.profiles.find((p) => p.id === profile.id)
    if (existing) {
      Object.assign(existing, profile, { updatedAt: new Date().toISOString() })
      this.markDirty()
      return existing
    }
    const row = { ...profile, createdAt: new Date().toISOString() }
    this.data.profiles.push(row)
    this.markDirty()
    return row
  }

  // ------------------------------------------------------------ bookmarks --

  async listBookmarks(userId) {
    const rows = this.index.bookmarksByUser.get(userId) ?? []
    const hackathons = rows
      .map((b) => this.index.hackathonsById.get(String(b.hackathonId)))
      .filter(Boolean)
      .sort((a, b) => new Date(b.firstDiscoveredAt) - new Date(a.firstDiscoveredAt))
    return hackathons
  }

  async listBookmarkRows(userId) {
    return this.index.bookmarksByUser.get(userId) ?? []
  }

  async addBookmark(userId, hackathonId) {
    const rows = this.index.bookmarksByUser.get(userId) ?? []
    if (rows.some((b) => String(b.hackathonId) === String(hackathonId))) return false
    const row = {
      id: nextId(this.data.bookmarks),
      userId,
      hackathonId: String(hackathonId),
      createdAt: new Date().toISOString(),
    }
    this.data.bookmarks.push(row)
    this.index.bookmarksByUser.set(userId, [...rows, row])
    this.markDirty()
    return true
  }

  async removeBookmark(userId, hackathonId) {
    const rows = this.index.bookmarksByUser.get(userId) ?? []
    const next = rows.filter((b) => String(b.hackathonId) !== String(hackathonId))
    if (next.length === rows.length) return false
    this.data.bookmarks = this.data.bookmarks.filter(
      (b) => !(b.userId === userId && String(b.hackathonId) === String(hackathonId)),
    )
    this.index.bookmarksByUser.set(userId, next)
    this.markDirty()
    return true
  }

  async listBookmarkedIds(userId) {
    return (this.index.bookmarksByUser.get(userId) ?? []).map((b) => String(b.hackathonId))
  }

  // --------------------------------------------------------- project ideas --

  async listProjectIdeas(userId) {
    return (this.index.ideasByUser.get(userId) ?? []).sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    )
  }

  async createProjectIdea(idea) {
    const row = {
      id: nextId(this.data.projectIdeas),
      createdAt: new Date().toISOString(),
      ...idea,
    }
    this.data.projectIdeas.push(row)
    this.index.ideasByUser.set(idea.userId, [
      ...(this.index.ideasByUser.get(idea.userId) ?? []),
      row,
    ])
    this.markDirty()
    return row
  }

  async deleteProjectIdea(userId, id) {
    const before = this.data.projectIdeas.length
    this.data.projectIdeas = this.data.projectIdeas.filter(
      (i) => !(String(i.id) === String(id) && i.userId === userId),
    )
    if (this.data.projectIdeas.length !== before) {
      this.rebuildIndexes()
      this.markDirty()
      return true
    }
    return false
  }

  // --------------------------------------------------------- notifications --

  async listNotifications(userId, { limit = 50, unreadOnly = false } = {}) {
    return (this.index.notificationsByUser.get(userId) ?? [])
      .filter((n) => (unreadOnly ? !n.readAt : true))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit)
  }

  async countUnreadNotifications(userId) {
    return (this.index.notificationsByUser.get(userId) ?? []).filter((n) => !n.readAt).length
  }

  /**
   * Insert notifications, skipping any whose dedupeKey already exists for the
   * user. This is what stops a repeated sync run from re-alerting.
   */
  async createNotifications(rows) {
    const created = []
    for (const row of rows) {
      if (row.dedupeKey) {
        const existing = this.data.notifications.find(
          (n) => n.userId === row.userId && n.dedupeKey === row.dedupeKey,
        )
        if (existing) continue
      }
      const notification = {
        id: nextId(this.data.notifications),
        readAt: null,
        createdAt: new Date().toISOString(),
        ...row,
      }
      this.data.notifications.push(notification)
      this.index.notificationsByUser.set(notification.userId, [
        ...(this.index.notificationsByUser.get(notification.userId) ?? []),
        notification,
      ])
      created.push(notification)
    }
    if (created.length) this.markDirty()
    return created
  }

  async markNotificationRead(userId, id) {
    const notification = this.data.notifications.find(
      (n) => String(n.id) === String(id) && n.userId === userId,
    )
    if (!notification) return false
    notification.readAt = new Date().toISOString()
    this.markDirty()
    return true
  }

  async markAllNotificationsRead(userId) {
    const rows = this.index.notificationsByUser.get(userId) ?? []
    const stamp = new Date().toISOString()
    let changed = 0
    for (const n of rows) {
      if (!n.readAt) {
        n.readAt = stamp
        changed += 1
      }
    }
    if (changed) this.markDirty()
    return changed
  }

  async deleteAllNotifications(userId) {
    const before = this.data.notifications.length
    this.data.notifications = this.data.notifications.filter((n) => n.userId !== userId)
    if (this.data.notifications.length !== before) {
      this.rebuildIndexes()
      this.markDirty()
      return true
    }
    return false
  }

  // --------------------------------------------------------- subscriptions --

  async listSubscriptions(userId) {
    return this.index.subsByUser.get(userId) ?? []
  }

  async listAllActiveSubscriptions() {
    return this.data.notificationSubscriptions.filter((s) => s.active)
  }

  async upsertSubscription(userId, subscriptionType, subscriptionData = {}, active = true) {
    const rows = this.index.subsByUser.get(userId) ?? []
    const existing = rows.find((s) => s.subscriptionType === subscriptionType)
    if (existing) {
      existing.subscriptionData = subscriptionData
      existing.active = active
      existing.updatedAt = new Date().toISOString()
      this.markDirty()
      return existing
    }
    const row = {
      id: nextId(this.data.notificationSubscriptions),
      userId,
      subscriptionType,
      subscriptionData,
      active,
      createdAt: new Date().toISOString(),
    }
    this.data.notificationSubscriptions.push(row)
    this.index.subsByUser.set(userId, [...rows, row])
    this.markDirty()
    return row
  }

  async deleteSubscription(userId, subscriptionType) {
    const rows = this.index.subsByUser.get(userId) ?? []
    const next = rows.filter((s) => s.subscriptionType !== subscriptionType)
    if (next.length === rows.length) return false
    this.data.notificationSubscriptions = this.data.notificationSubscriptions.filter(
      (s) => !(s.userId === userId && s.subscriptionType === subscriptionType),
    )
    this.index.subsByUser.set(userId, next)
    this.markDirty()
    return true
  }

  // ------------------------------------------------------ push endpoints --

  async savePushSubscription(userId, subscription) {
    const key = `${userId}:${subscription.endpoint}`
    const existing = this.data.pushSubscriptions.find((p) => p.key === key)
    if (existing) return existing
    const row = {
      id: nextId(this.data.pushSubscriptions),
      key,
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys?.p256dh ?? null,
      auth: subscription.keys?.auth ?? null,
      userAgent: subscription.userAgent ?? null,
      createdAt: new Date().toISOString(),
    }
    this.data.pushSubscriptions.push(row)
    this.markDirty()
    return row
  }

  async removePushSubscription(userId, endpoint) {
    const key = `${userId}:${endpoint}`
    const before = this.data.pushSubscriptions.length
    this.data.pushSubscriptions = this.data.pushSubscriptions.filter((p) => p.key !== key)
    if (this.data.pushSubscriptions.length !== before) this.markDirty()
    return before !== this.data.pushSubscriptions.length
  }

  async listPushSubscriptions(userId) {
    return userId
      ? this.data.pushSubscriptions.filter((p) => p.userId === userId)
      : this.data.pushSubscriptions
  }

  // ------------------------------------------------------------ sync logs --

  async createSyncLog(entry) {
    const row = { id: nextId(this.data.syncLogs), ...entry }
    this.data.syncLogs.push(row)
    // Keep the log bounded — 500 entries is plenty of operational history.
    if (this.data.syncLogs.length > 500) {
      this.data.syncLogs = this.data.syncLogs.slice(-500)
    }
    this.markDirty()
    return row
  }

  async listSyncLogs({ limit = 50 } = {}) {
    return [...this.data.syncLogs].sort((a, b) => new Date(b.syncStartedAt) - new Date(a.syncStartedAt)).slice(0, limit)
  }

  async lastSuccessfulSync() {
    return [...this.data.syncLogs]
      .filter((l) => l.status === 'success')
      .sort((a, b) => new Date(b.syncCompletedAt || b.syncStartedAt) - new Date(a.syncStartedAt))[0] ?? null
  }

  async stats() {
    const active = this.data.hackathons.filter((h) => h.status === 'active' || h.status === 'upcoming')
    return {
      hackathons: this.data.hackathons.length,
      activeHackathons: active.length,
      users: this.data.profiles.length,
      bookmarks: this.data.bookmarks.length,
      projectIdeas: this.data.projectIdeas.length,
      notifications: this.data.notifications.length,
      subscriptions: this.data.notificationSubscriptions.filter((s) => s.active).length,
    }
  }

  async allProfiles() {
    return this.data.profiles
  }
}

function groupBy(rows, key) {
  const map = new Map()
  for (const row of rows) {
    const k = row[key]
    if (!map.has(k)) map.set(k, [])
    map.get(k).push(row)
  }
  return map
}

let idCounter = Date.now()
function nextId(rows) {
  idCounter += 1
  // Keep ids unique even across an empty collection.
  while (rows.some((r) => String(r.id) === String(idCounter))) idCounter += 1
  return idCounter
}

/**
 * Merge an incoming record into an existing row. Returns true when something
 * meaningful changed so the sync orchestrator can report accurate counts and
 * avoid emitting pointless realtime events.
 */
function mergeInto(existing, incoming, nowIso) {
  let changed = false
  for (const [key, value] of Object.entries(incoming)) {
    if (key === 'firstDiscoveredAt' || key === 'createdAt') continue
    if (value === null || value === undefined) continue
    if (key === 'id' && String(value) !== String(existing.id)) continue
    if (JSON.stringify(existing[key]) !== JSON.stringify(value)) {
      existing[key] = value
      changed = true
    }
  }
  // Track true source-side changes separately from our own sync timestamp so
  // `updatedAt` genuinely means "the source published a change".
  const sourceFields = [
    'title', 'description', 'summary', 'organizer', 'bannerUrl', 'officialUrl',
    'registrationUrl', 'category', 'technologies', 'startDate', 'endDate',
    'registrationDeadline', 'eventFormat', 'location', 'country', 'prizePool',
    'currency', 'eligibility', 'teamSize', 'themes', 'judgingCriteria',
    'resources', 'faq', 'status', 'sourcePublishedAt', 'registrationOpen',
    'participantCount', 'sourceUrl',
  ]
  const sourceChanged = sourceFields.some(
    (f) => incoming[f] !== undefined && incoming[f] !== null && incoming[f] !== '' &&
      JSON.stringify(existing[f]) !== JSON.stringify(incoming[f]),
  )
  if (sourceChanged) existing.updatedAt = nowIso
  existing.lastVerifiedAt = nowIso
  return changed
}

export function createLocalStore(dir = config.dataDir) {
  return new LocalStore(dir).init()
}

export { LocalStore }
