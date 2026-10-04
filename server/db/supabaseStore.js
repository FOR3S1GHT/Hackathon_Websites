import { createClient } from '@supabase/supabase-js'
import { config } from '../config.js'
import { createLogger } from '../lib/logger.js'
import { asArray, aggregateCounts, NEWLY_ADDED_WINDOW_DAYS } from '../services/search.js'
import { daysUntil, now } from '../lib/dates.js'

const log = createLogger('store:supabase')

/**
 * Supabase / PostgREST implementation of the store contract.
 *
 * Uses the **service role** key: every request originates from our backend, so
 * there is no end-user JWT to forward. Authorisation for end users is enforced
 * by Row Level Security on the browser's anon client (see
 * supabase/migrations/0002_rls.sql) *and* by the backend scoping every query
 * here to the authenticated `userId` it received from a verified session.
 *
 * Search/filter semantics are kept identical to localStore.js — see
 * services/search.js for the reference implementation of the scoring rules.
 */
class SupabaseStore {
  constructor(url, key) {
    this.client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }

  async init() {
    const { error } = await this.client.from('hackathons').select('id').limit(1)
    if (error) throw new Error(`Supabase connection failed: ${error.message}`)
    log.info('Supabase store ready')
    return this
  }

  // ---------------------------------------------------------------- meta --

  async getMeta(key) {
    const { data, error } = await this.client.from('app_meta').select('value').eq('key', key).maybeSingle()
    if (error) throw error
    return data?.value ?? null
  }

  async setMeta(key, value) {
    const { error } = await this.client
      .from('app_meta')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (error) throw error
    return value
  }

  // ----------------------------------------------------------- hackathons --

  async upsertHackathons(records) {
    if (!records.length) return { inserted: [], updated: [] }

    const stamp = new Date().toISOString()
    const keys = records.map((r) => ({ source_name: r.sourceName, source_event_id: r.sourceEventId }))

    // Which of these already exist? The unique index makes this idempotent.
    const { data: existing, error: lookupError } = await this.client
      .from('hackathons')
      .select('id,source_name,source_event_id,title,first_discovered_at')
      .or(
        keys
          .map(
            (k) =>
              `and(source_name.eq.${k.source_name},source_event_id.eq.${k.source_event_id})`,
          )
          .join(','),
      )
    if (lookupError) {
      // `or()` string length limits: fall back to a per-source lookup.
      log.warn('Bulk existence lookup failed, using per-source lookup', lookupError.message)
      return this.#upsertChunked(records, stamp)
    }

    const existingKeys = new Set(existing.map((e) => `${e.source_name}:${e.source_event_id}`))
    const newRows = []
    const updateRows = []

    for (const record of records) {
      const row = toRow(record)
      const key = `${record.sourceName}:${record.sourceEventId}`
      const match = existing.find((e) => `${e.source_name}:${e.source_event_id}` === key)
      if (existingKeys.has(key)) {
        updateRows.push({ ...row, id: match.id, last_verified_at: stamp })
      } else {
        newRows.push({ ...row, first_discovered_at: record.firstDiscoveredAt ?? stamp })
      }
    }

    const inserted = []
    const updated = []

    if (newRows.length) {
      const { data, error } = await this.client.from('hackathons').insert(newRows).select()
      if (error) throw error
      inserted.push(...(data ?? []))
    }

    // Only touch rows whose content actually differs.
    const changedUpdates = updateRows.filter((row) => {
      const match = existing.find(
        (e) => `${e.source_name}:${e.source_event_id}` === `${row.source_name}:${row.source_event_id}`,
      )
      return match && match.title !== row.title
    })
    if (changedUpdates.length) {
      const { data, error } = await this.client.from('hackathons').upsert(changedUpdates).select()
      if (error) throw error
      updated.push(...(data ?? []))
    }

    // Refresh last_verified_at for the untouched ones in a single light update.
    if (updateRows.length > changedUpdates.length) {
      const ids = updateRows
        .filter((r) => !changedUpdates.includes(r))
        .map((r) => r.id)
      if (ids.length) {
        await this.client.from('hackathons').update({ last_verified_at: stamp }).in('id', ids)
      }
    }

    return { inserted, updated }
  }

  async #upsertChunked(records, stamp) {
    const inserted = []
    const updated = []
    for (const record of records) {
      const { data: existing } = await this.client
        .from('hackathons')
        .select('id')
        .eq('source_name', record.sourceName)
        .eq('source_event_id', record.sourceEventId)
        .maybeSingle()
      const row = toRow(record)
      if (existing) {
        const { data } = await this.client
          .from('hackathons')
          .update({ ...row, last_verified_at: stamp })
          .eq('id', existing.id)
          .select()
        if (data?.[0]) updated.push(data[0])
      } else {
        const { data, error } = await this.client
          .from('hackathons')
          .insert({ ...row, first_discovered_at: record.firstDiscoveredAt ?? stamp })
          .select()
        if (error) log.error('Insert failed', error.message)
        else if (data?.[0]) inserted.push(data[0])
      }
    }
    return { inserted, updated }
  }

  async getHackathonById(id) {
    const { data, error } = await this.client.from('hackathons').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data ? fromRow(data) : null
  }

  async getHackathonBySlug(slug) {
    const { data, error } = await this.client.from('hackathons').select('*').eq('slug', slug).maybeSingle()
    if (error) throw error
    return data ? fromRow(data) : null
  }

  async findHackathonCandidates() {
    const { data, error } = await this.client
      .from('hackathons')
      .select('*')
      .order('first_discovered_at', { ascending: false })
      .limit(6000)
    if (error) throw error
    return (data ?? []).map(fromRow)
  }

  async markExpired(sourceNames, reference = now()) {
    const stamp = reference.toISOString()
    let query = this.client
      .from('hackathons')
      .update({ status: 'completed', updated_at: stamp })
      .neq('status', 'completed')
      .neq('status', 'cancelled')
      .lt('start_date', stamp)
      .not('end_date', 'is', null)
      .lt('end_date', stamp)
    if (sourceNames?.length) query = query.in('source_name', sourceNames)
    const { data, error } = await query.select('id')
    if (error) throw error
    return data?.length ?? 0
  }

  async saveHackathons() {
    throw new Error('saveHackathons is not supported on the Supabase driver')
  }

  async deleteHackathon(id) {
    const { error } = await this.client.from('hackathons').delete().eq('id', id)
    if (error) throw error
    return true
  }

  async #buildQuery(params, reference) {
    const q = this.client.from('hackathons').select('*', { count: 'exact' })
    const statuses = asArray(params.status)
    const registration = asArray(params.registration)
    const formats = asArray(params.format)
    const categories = asArray(params.category)
    const technologies = asArray(params.technology)
    const countries = asArray(params.country)

    if (categories.length) q.in('category', categories)
    if (formats.length) q.in('event_format', formats)

    // PostgREST's .or() takes ONE comma-joined list per call, and every call is
    // ANDed with the rest of the query. Calling it three times would therefore
    // mean "technology AND country AND free text", which is not what the filters
    // mean. All OR groups are collected and applied as a single call.
    const orGroups = []

    if (technologies.length) {
      orGroups.push(technologies.map((t) => `technologies.cs.{"${escapeFilterValue(t)}"}`).join(','))
    }
    if (countries.length) {
      orGroups.push(countries.map((c) => `country.il.*${escapeFilterValue(c)}*`).join(','))
    }
    if (params.q) {
      const term = escapeFilterValue(String(params.q).trim())
      orGroups.push(
        [
          `title.il.*${term}*`,
          `organizer.il.*${term}*`,
          `summary.il.*${term}*`,
          `location.il.*${term}*`,
          `country.il.*${term}*`,
          `themes.cs.{"${term}"}`,
          `technologies.cs.{"${term}"}`,
        ].join(','),
      )
    }
    // `newly-added` is a first_discovered_at window; the other three statuses are
    // derived from the real dates, so each becomes one boolean term and the
    // requested statuses are ORed together.
    const concrete = statuses.filter((s) => s !== 'newly-added')
    const statusTerms = []
    if (statuses.includes('newly-added')) {
      const cutoff = new Date(reference.getTime() - NEWLY_ADDED_WINDOW_DAYS * 86_400_000).toISOString()
      statusTerms.push(`first_discovered_at.gte.${cutoff}`)
    }
    if (concrete.includes('upcoming')) {
      // Not started yet. An event with no start date cannot be shown to have
      // started, so it stays in "upcoming" rather than vanishing from the list.
      statusTerms.push(`and(start_date.gt.${reference.toISOString()},start_date.is.null)`)
    }
    if (concrete.includes('ongoing')) {
      statusTerms.push(
        `and(start_date.lte.${reference.toISOString()},or(end_date.gte.${reference.toISOString()},end_date.is.null))`,
      )
    }
    if (concrete.includes('completed')) {
      statusTerms.push(`end_date.lt.${reference.toISOString()}`)
    }
    if (statusTerms.length) orGroups.push(statusTerms.join(','))

    if (registration.includes('open')) {
      // "Open" means the organiser has not closed it, and any published deadline
      // has not passed. No deadline is not evidence of a closed registration.
      orGroups.push(
        [
          'registration_open.eq.true',
          `and(registration_deadline.is.null,registration_deadline.gte.${reference.toISOString()})`,
          'registration_deadline.is.null',
        ].join(','),
      )
    }
    if (registration.includes('closing-soon')) {
      const limit = new Date(
        reference.getTime() + (params.closingSoonDays ?? 5) * 86_400_000,
      ).toISOString()
      orGroups.push(
        `and(registration_deadline.gte.${reference.toISOString()},registration_deadline.lte.${limit})`,
      )
    }

    // The four boolean facets are three-state: absent means no restriction, and
    // an explicit `false` selects the inverse.
    //
    // "Free to enter" is asserted, never inferred. `is_free.eq.true` is the
    // honest translation of the local store's `h.isFree === params.freeOnly`:
    // rows where the source published no fee stay `is_free = null` and are
    // therefore excluded, which is the majority of the catalogue (Devpost,
    // HackerEarth and Devfolio publish no fee information).
    //
    // Every one of these has to go into `orGroups` rather than separate
    // `q.or()` calls, because PostgREST's `or` parameter is a single key —
    // calling `.or()` twice overwrites the first group instead of ANDing with
    // it, silently discarding every other OR filter in the query. Hence exactly
    // one `q.or()` below, fed by the array.
    if (params.freeOnly === true) orGroups.push('is_free.eq.true')
    else if (params.freeOnly === false) orGroups.push('is_free.is.null,is_free.eq.false')
    if (params.prizeOnly === false) orGroups.push('prize_pool.is.null,prize_pool.lte.0')
    if (params.beginnerFriendly === false) {
      orGroups.push('beginner_friendly.is.null,beginner_friendly.eq.false')
    }
    if (params.featuredOnly === false) orGroups.push('featured.is.null,featured.eq.false')

    if (orGroups.length) q.or(orGroups.join(' and '))

    if (params.prizeOnly === true) q.gt('prize_pool', 0)
    if (params.beginnerFriendly === true) q.eq('beginner_friendly', true)
    if (params.featuredOnly === true) q.eq('featured', true)

    if (params.dateFrom) q.gte('end_date', params.dateFrom)
    if (params.dateTo) q.lte('start_date', params.dateTo)

    switch (params.sort) {
      case 'registration-deadline':
        q.order('registration_deadline', { ascending: true, nullsFirst: false })
        break
      case 'start-date':
        q.order('start_date', { ascending: true, nullsFirst: false })
        break
      case 'prize-pool':
        q.order('prize_pool', { ascending: false, nullsFirst: false })
        break
      case 'alphabetical':
        q.order('title', { ascending: true })
        break
      case 'relevance':
        q.order('first_discovered_at', { ascending: false })
        break
      default:
        q.order('first_discovered_at', { ascending: false })
    }

    return q
  }

  async queryHackathons(params) {
    const reference = params.now ? new Date(params.now) : now()
    const page = Math.max(1, Number(params.page) || 1)
    const pageSize = Math.min(Math.max(Number(params.pageSize) || 12, 1), 60)

    const { data, error, count } = await (await this.#buildQuery(params, reference))
      .range((page - 1) * pageSize, page * pageSize - 1)
    if (error) throw error

    const items = (data ?? []).map(fromRow)

    // PostgREST cannot express the date-derived status filter, so the
    // incomplete facet counts are supplemented with one aggregate query.
    let globalCounts = null
    if (params.includeFacets !== false) {
      const { data: all } = await this.client
        .from('hackathons')
        .select('category,country,technologies,prize_pool,event_format,status,start_date,end_date,registration_deadline,registration_open,first_discovered_at')
        .limit(20000)
      globalCounts = aggregateCounts(
        (all ?? []).map((row) => ({
          category: row.category,
          country: row.country,
          technologies: row.technologies ?? [],
          prizePool: row.prize_pool ?? 0,
          eventFormat: row.event_format,
          status: row.status,
          startDate: row.start_date,
          endDate: row.end_date,
          registrationDeadline: row.registration_deadline,
          registrationOpen: row.registration_open,
          firstDiscoveredAt: row.first_discovered_at,
        })),
        reference,
      )
    }

    return {
      items,
      total: count ?? items.length,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil((count ?? items.length) / pageSize)),
      hasMore: page * pageSize < (count ?? items.length),
      globalCounts,
    }
  }

  // ------------------------------------------------------------- profiles --

  async getProfile(userId) {
    const { data, error } = await this.client.from('profiles').select('*').eq('id', userId).maybeSingle()
    if (error) throw error
    return data ? fromProfileRow(data) : null
  }

  async upsertProfile(profile) {
    const row = {
      id: profile.id,
      display_name: profile.displayName ?? null,
      email: profile.email ?? null,
      avatar_url: profile.avatarUrl ?? null,
      preferred_categories: profile.preferredCategories ?? [],
      preferred_technologies: profile.preferredTechnologies ?? [],
      notification_preferences: profile.notificationPreferences ?? {},
      updated_at: new Date().toISOString(),
    }
    const { data, error } = await this.client.from('profiles').upsert(row, { onConflict: 'id' }).select()
    if (error) throw error
    return fromProfileRow(data[0])
  }

  async allProfiles() {
    const { data, error } = await this.client.from('profiles').select('*').limit(10000)
    if (error) throw error
    return (data ?? []).map(fromProfileRow)
  }

  // ------------------------------------------------------------ bookmarks --

  async listBookmarks(userId) {
    const { data, error } = await this.client
      .from('bookmarks')
      .select('hackathon:hackathons(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? [])
      .map((row) => (Array.isArray(row.hackathon) ? row.hackathon[0] : row.hackathon))
      .filter(Boolean)
      .map(fromRow)
  }

  async listBookmarkRows(userId) {
    const { data, error } = await this.client.from('bookmarks').select('*').eq('user_id', userId)
    if (error) throw error
    return (data ?? []).map((r) => ({ hackathonId: String(r.hackathon_id), createdAt: r.created_at }))
  }

  async addBookmark(userId, hackathonId) {
    const { error } = await this.client
      .from('bookmarks')
      .upsert({ user_id: userId, hackathon_id: hackathonId }, { onConflict: 'user_id,hackathon_id' })
    if (error) throw error
    return true
  }

  async removeBookmark(userId, hackathonId) {
    const { error } = await this.client
      .from('bookmarks')
      .delete()
      .eq('user_id', userId)
      .eq('hackathon_id', hackathonId)
    if (error) throw error
    return true
  }

  async listBookmarkedIds(userId) {
    const { data, error } = await this.client.from('bookmarks').select('hackathon_id').eq('user_id', userId)
    if (error) throw error
    return (data ?? []).map((r) => String(r.hackathon_id))
  }

  // --------------------------------------------------------- project ideas --

  async listProjectIdeas(userId) {
    const { data, error } = await this.client
      .from('project_ideas')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map((r) => ({
      id: r.id,
      userId: r.user_id,
      hackathonId: String(r.hackathon_id ?? ''),
      hackathonTitle: r.hackathon_title,
      title: r.title,
      description: r.description,
      problem: r.problem,
      targetUsers: r.target_users,
      difficulty: r.difficulty,
      technologies: r.technologies ?? [],
      keyFeatures: r.key_features ?? [],
      implementationSteps: r.implementation_steps ?? [],
      estimatedTime: r.estimated_time,
      demoTips: r.demo_tips,
      source: r.source,
      createdAt: r.created_at,
    }))
  }

  async createProjectIdea(idea) {
    const { data, error } = await this.client
      .from('project_ideas')
      .insert({
        user_id: idea.userId,
        hackathon_id: idea.hackathonId,
        hackathon_title: idea.hackathonTitle ?? null,
        title: idea.title,
        description: idea.description,
        problem: idea.problem,
        target_users: idea.targetUsers,
        difficulty: idea.difficulty,
        technologies: idea.technologies ?? [],
        key_features: idea.keyFeatures ?? [],
        implementation_steps: idea.implementationSteps ?? [],
        estimated_time: idea.estimatedTime,
        demo_tips: idea.demoTips,
        source: idea.source ?? 'rule-based',
      })
      .select()
      .single()
    if (error) throw error
    return data
  }

  async deleteProjectIdea(userId, id) {
    const { error } = await this.client.from('project_ideas').delete().eq('user_id', userId).eq('id', id)
    if (error) throw error
    return true
  }

  // --------------------------------------------------------- notifications --

  async listNotifications(userId, { limit = 50, unreadOnly = false } = {}) {
    let query = this.client
      .from('notifications')
      .select('*, hackathon:hackathons(id,slug,title,registration_deadline,start_date,end_date,event_format,banner_url)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (unreadOnly) query = query.is('read_at', null)
    const { data, error } = await query
    if (error) throw error
    return (data ?? []).map((r) => ({
      id: r.id,
      userId: r.user_id,
      hackathonId: r.hackathon_id ? String(r.hackathon_id) : null,
      title: r.title,
      message: r.message,
      type: r.type,
      readAt: r.read_at,
      createdAt: r.created_at,
      hackathon: r.hackathon
        ? Array.isArray(r.hackathon)
          ? r.hackathon[0]
            ? { id: String(r.hackathon[0].id), slug: r.hackathon[0].slug, title: r.hackathon[0].title }
            : null
          : { id: String(r.hackathon.id), slug: r.hackathon.slug, title: r.hackathon.title }
        : null,
    }))
  }

  async countUnreadNotifications(userId) {
    const { count, error } = await this.client
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null)
    if (error) throw error
    return count ?? 0
  }

  async createNotifications(rows) {
    if (!rows.length) return []
    const payload = rows.map((r) => ({
      user_id: r.userId,
      hackathon_id: r.hackathonId ?? null,
      title: r.title,
      message: r.message,
      type: r.type,
      dedupe_key: r.dedupeKey ?? null,
      metadata: r.metadata ?? {},
    }))
    const { data, error } = await this.client
      .from('notifications')
      .upsert(payload, { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true })
      .select()
    if (error) {
      log.error('Notification insert failed', error.message)
      return []
    }
    return (data ?? []).map((r) => ({ ...r, id: r.id, userId: r.user_id }))
  }

  async markNotificationRead(userId, id) {
    const { error } = await this.client
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('id', id)
    if (error) throw error
    return true
  }

  async markAllNotificationsRead(userId) {
    const { data, error } = await this.client
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('read_at', null)
      .select('id')
    if (error) throw error
    return data?.length ?? 0
  }

  async deleteAllNotifications(userId) {
    const { error } = await this.client.from('notifications').delete().eq('user_id', userId)
    if (error) throw error
    return true
  }

  // --------------------------------------------------------- subscriptions --

  async listSubscriptions(userId) {
    const { data, error } = await this.client
      .from('notification_subscriptions')
      .select('*')
      .eq('user_id', userId)
    if (error) throw error
    return (data ?? []).map((r) => ({
      id: r.id,
      userId: r.user_id,
      subscriptionType: r.subscription_type,
      subscriptionData: r.subscription_data ?? {},
      active: r.active,
      createdAt: r.created_at,
    }))
  }

  async listAllActiveSubscriptions() {
    const { data, error } = await this.client
      .from('notification_subscriptions')
      .select('*')
      .eq('active', true)
    if (error) throw error
    return (data ?? []).map((r) => ({
      id: r.id,
      userId: r.user_id,
      subscriptionType: r.subscription_type,
      subscriptionData: r.subscription_data ?? {},
      active: r.active,
      createdAt: r.created_at,
    }))
  }

  async upsertSubscription(userId, subscriptionType, subscriptionData = {}, active = true) {
    const { data, error } = await this.client
      .from('notification_subscriptions')
      .upsert(
        {
          user_id: userId,
          subscription_type: subscriptionType,
          subscription_data: subscriptionData,
          active,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,subscription_type' },
      )
      .select()
      .single()
    if (error) throw error
    return {
      id: data.id,
      userId,
      subscriptionType,
      subscriptionData,
      active,
      createdAt: data.created_at,
    }
  }

  async deleteSubscription(userId, subscriptionType) {
    const { error } = await this.client
      .from('notification_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('subscription_type', subscriptionType)
    if (error) throw error
    return true
  }

  // ------------------------------------------------------ push endpoints --

  async savePushSubscription(userId, subscription) {
    const { data, error } = await this.client
      .from('push_subscriptions')
      .upsert(
        {
          user_id: userId,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys?.p256dh ?? null,
          auth: subscription.keys?.auth ?? null,
          user_agent: subscription.userAgent ?? null,
        },
        { onConflict: 'user_id,endpoint' },
      )
      .select()
      .single()
    if (error) throw error
    return data
  }

  async removePushSubscription(userId, endpoint) {
    const { error } = await this.client
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('endpoint', endpoint)
    if (error) throw error
    return true
  }

  async listPushSubscriptions(userId) {
    let query = this.client.from('push_subscriptions').select('*')
    if (userId) query = query.eq('user_id', userId)
    const { data, error } = await query.limit(20000)
    if (error) throw error
    return (data ?? []).map((r) => ({
      id: r.id,
      userId: r.user_id,
      endpoint: r.endpoint,
      p256dh: r.p256dh,
      auth: r.auth,
    }))
  }

  // ------------------------------------------------------------ sync logs --

  async createSyncLog(entry) {
    const { data, error } = await this.client
      .from('sync_logs')
      .insert({
        source_name: entry.sourceName,
        sync_started_at: entry.syncStartedAt,
        sync_completed_at: entry.syncCompletedAt ?? null,
        status: entry.status,
        events_discovered: entry.eventsDiscovered ?? 0,
        events_updated: entry.eventsUpdated ?? 0,
        error_message: entry.errorMessage ?? null,
        duration_ms: entry.durationMs ?? null,
      })
      .select()
      .single()
    if (error) throw error
    return data
  }

  async listSyncLogs({ limit = 50 } = {}) {
    const { data, error } = await this.client
      .from('sync_logs')
      .select('*')
      .order('sync_started_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return (data ?? []).map((r) => ({
      id: r.id,
      sourceName: r.source_name,
      syncStartedAt: r.sync_started_at,
      syncCompletedAt: r.sync_completed_at,
      status: r.status,
      eventsDiscovered: r.events_discovered,
      eventsUpdated: r.events_updated,
      errorMessage: r.error_message,
      durationMs: r.duration_ms,
    }))
  }

  async lastSuccessfulSync() {
    const { data, error } = await this.client
      .from('sync_logs')
      .select('*')
      .eq('status', 'success')
      .order('sync_completed_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) return null
    if (!data) return null
    return {
      id: data.id,
      sourceName: data.source_name,
      syncCompletedAt: data.sync_completed_at,
      status: data.status,
    }
  }

  async stats() {
    const [hackathons, active, users, bookmarks, ideas, notifications, subs] = await Promise.all([
      this.client.from('hackathons').select('id', { count: 'exact', head: true }),
      this.client
        .from('hackathons')
        .select('id', { count: 'exact', head: true })
        .in('status', ['active', 'upcoming']),
      this.client.from('profiles').select('id', { count: 'exact', head: true }),
      this.client.from('bookmarks').select('id', { count: 'exact', head: true }),
      this.client.from('project_ideas').select('id', { count: 'exact', head: true }),
      this.client.from('notifications').select('id', { count: 'exact', head: true }),
      this.client.from('notification_subscriptions').select('id', { count: 'exact', head: true }).eq('active', true),
    ])
    return {
      hackathons: hackathons.count ?? 0,
      activeHackathons: active.count ?? 0,
      users: users.count ?? 0,
      bookmarks: bookmarks.count ?? 0,
      projectIdeas: ideas.count ?? 0,
      notifications: notifications.count ?? 0,
      subscriptions: subs.count ?? 0,
    }
  }
}

/** camelCase domain object -> snake_case DB row. */
export function toRow(record) {
  return {
    title: record.title ?? null,
    slug: record.slug ?? null,
    description: record.description ?? null,
    summary: record.summary ?? null,
    organizer: record.organizer ?? null,
    banner_url: record.bannerUrl ?? null,
    official_url: record.officialUrl ?? null,
    registration_url: record.registrationUrl ?? null,
    source_url: record.sourceUrl ?? null,
    source_name: record.sourceName ?? null,
    source_event_id: String(record.sourceEventId ?? ''),
    category: record.category ?? null,
    technologies: record.technologies ?? [],
    themes: record.themes ?? [],
    start_date: record.startDate ?? null,
    end_date: record.endDate ?? null,
    registration_deadline: record.registrationDeadline ?? null,
    event_format: record.eventFormat ?? null,
    location: record.location ?? null,
    country: record.country ?? null,
    prize_pool: record.prizePool ?? null,
    currency: record.currency ?? null,
    eligibility: record.eligibility ?? null,
    eligibility_level: record.eligibilityLevel ?? null,
    beginner_friendly: record.beginnerFriendly ?? null,
    team_size: record.teamSize ?? null,
    judging_criteria: record.judgingCriteria ?? null,
    resources: record.resources ?? [],
    faq: record.faq ?? [],
    status: record.status ?? null,
    is_paid: record.isPaid ?? null,
    is_free: record.isFree ?? null,
    featured: record.featured ?? null,
    registration_open: record.registrationOpen ?? null,
    participant_count: record.participantCount ?? null,
    source_published_at: record.sourcePublishedAt ?? null,
  }
}

/** snake_case DB row -> camelCase domain object. */
export function fromRow(row) {
  return {
    id: String(row.id),
    title: row.title,
    slug: row.slug,
    description: row.description,
    summary: row.summary,
    organizer: row.organizer,
    bannerUrl: row.banner_url,
    officialUrl: row.official_url,
    registrationUrl: row.registration_url,
    sourceUrl: row.source_url,
    sourceName: row.source_name,
    sourceEventId: String(row.source_event_id ?? ''),
    category: row.category,
    technologies: row.technologies ?? [],
    themes: row.themes ?? [],
    startDate: row.start_date,
    endDate: row.end_date,
    registrationDeadline: row.registration_deadline,
    eventFormat: row.event_format,
    location: row.location,
    country: row.country,
    prizePool: row.prize_pool,
    currency: row.currency,
    eligibility: row.eligibility,
    eligibilityLevel: row.eligibility_level,
    beginnerFriendly: row.beginner_friendly,
    teamSize: row.team_size,
    judgingCriteria: row.judging_criteria,
    resources: row.resources ?? [],
    faq: row.faq ?? [],
    status: row.status,
    isPaid: row.is_paid,
    isFree: row.is_free,
    featured: row.featured,
    registrationOpen: row.registration_open,
    participantCount: row.participant_count,
    sourcePublishedAt: row.source_published_at,
    firstDiscoveredAt: row.first_discovered_at,
    lastVerifiedAt: row.last_verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Make a user-supplied value safe to interpolate into a PostgREST filter string.
 *
 * The filter grammar uses commas, parentheses, dots and quotes as structure, so a
 * value containing them could inject an extra clause. Commas, parens, dots,
 * quotes, backslashes, spaces and wildcards are all neutralised. Search text is
 * sanitised too — losing a space is a far better outcome than a smuggled filter.
 */
function escapeFilterValue(value) {
  return String(value ?? '')
    .replace(/[,()."'\\%*]/g, ' ')
    .trim()
}

function fromProfileRow(row) {
  return {
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    avatarUrl: row.avatar_url,
    preferredCategories: row.preferred_categories ?? [],
    preferredTechnologies: row.preferred_technologies ?? [],
    notificationPreferences: row.notification_preferences ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function createSupabaseStore(url = config.supabase.url, key = config.supabase.serviceRoleKey) {
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  return new SupabaseStore(url, key).init()
}

export { SupabaseStore, daysUntil }
