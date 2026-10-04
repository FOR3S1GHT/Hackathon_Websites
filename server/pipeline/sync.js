import { config } from '../config.js'
import { getStore } from '../db/index.js'
import { createLogger } from '../lib/logger.js'
import { publish, EVENTS } from '../lib/events.js'
import { now } from '../lib/dates.js'
import { enabledSources, getSource } from '../sources/index.js'
import { dedupe } from './dedupe.js'
import { finalise, sanitiseFields, toPublicHackathon } from './normalize.js'
import { mapLimit } from '../lib/httpClient.js'

const log = createLogger('sync')

let running = false
let lastRunAt = null

export function isSyncRunning() {
  return running
}

/**
 * Fetch a single source, unless its configured interval has not elapsed.
 * Per-source intervals respect each upstream's volume and politeness.
 */
async function shouldRunSource(sourceName, force) {
  if (force) return true
  const store = getStore()
  const intervalMinutes = config.sync.perSourceIntervalMinutes[sourceName]
  if (!intervalMinutes || intervalMinutes <= 0) return true

  const lastLog = (await store.listSyncLogs({ limit: 25 })).find(
    (l) => l.sourceName === sourceName && l.status === 'success',
  )
  if (!lastLog?.syncCompletedAt) return true
  const elapsed = Date.now() - new Date(lastLog.syncCompletedAt).getTime()
  return elapsed >= intervalMinutes * 60_000
}

export async function runSync({ sources: onlySources, force = false, enrichBudget } = {}) {
  if (running) {
    log.warn('Sync already in progress, skipping')
    return { skipped: true }
  }
  running = true
  const startedAt = now()
  const startedMs = Date.now()

  const summary = {
    startedAt: startedAt.toISOString(),
    sources: [],
    discovered: 0,
    inserted: 0,
    updated: 0,
    expired: 0,
    enriched: 0,
    errors: 0,
    notificationsQueued: 0,
  }

  try {
    const store = getStore()
    const all = enabledSources()
    const targets = onlySources?.length
      ? onlySources.map((n) => getSource(n)).filter((s) => s && s.enabled())
      : all

    if (!targets.length) {
      log.warn('No enabled data sources')
      return summary
    }

    log.info(`Sync starting`, { sources: targets.map((s) => s.name) })

    // Per-source run bookkeeping, accumulated across the whole run and written
    // once at the end.
    //
    // Writing each log inline at fetch time looks simpler and is wrong: at that
    // point `inserted`/`updated` are unknown, because dedupe and upsert have not
    // run yet. The obvious consequence is that success rows were never written
    // at all, which broke three things downstream — `lastSuccessfulSync()`
    // returned null forever, the "recent runs" panel was permanently empty, and
    // `shouldRunSource` found no prior success so the per-source interval
    // throttle never engaged and every run refetched all four sources.
    const runs = new Map()

    // ---- 1. Fetch + normalise each source independently --------------------
    const fetched = await mapLimit(targets, 2, async (source) => {
      const sourceLog = log.child(source.name)
      const runStart = new Date().toISOString()
      const t0 = Date.now()
      runs.set(source.name, {
        sourceName: source.name,
        syncStartedAt: runStart,
        discovered: 0,
        inserted: 0,
        updated: 0,
        errorMessage: null,
        t0,
        // Flipped to true only when a fetch is actually attempted. A source
        // throttled by its own interval must not log a `success` row: that
        // would claim it had been checked when it was deliberately skipped,
        // and would push its next eligible run a whole interval further out.
        ran: false,
      })

      if (!(await shouldRunSource(source.name, force))) {
        sourceLog.info('Skipped — interval not elapsed')
        summary.sources.push({ name: source.name, status: 'skipped' })
        return { name: source.name, records: [] }
      }
      runs.get(source.name).ran = true

      try {
        const maxPages = config.sync.maxPages[source.name] ?? 4
        // Fetch a sensible multiple of the page budget so dedupe has candidates.
        const records = await source.fetchAll({ limit: maxPages * 100, log: sourceLog })

        if (!Array.isArray(records) || records.length === 0) {
          summary.sources.push({ name: source.name, status: 'empty', discovered: 0 })
          return { name: source.name, records: [] }
        }

        runs.get(source.name).discovered = records.length
        summary.discovered += records.length
        summary.sources.push({ name: source.name, status: 'fetched', discovered: records.length })
        return { name: source.name, records, runStart }
      } catch (err) {
        summary.errors += 1
        log.error(`Source ${source.name} failed`, err)
        const run = runs.get(source.name)
        run.status = 'failed'
        run.errorMessage = String(err?.message ?? err).slice(0, 500)
        summary.sources.push({ name: source.name, status: 'failed', error: err.message })
        return { name: source.name, records: [] }
      }
    })

    /** Write one `sync_logs` row per source that actually ran. */
    const writeRunLogs = async () => {
      for (const run of runs.values()) {
        if (!run.ran) continue
        await store
          .createSyncLog({
            sourceName: run.sourceName,
            syncStartedAt: run.syncStartedAt,
            syncCompletedAt: new Date().toISOString(),
            status: run.status ?? 'success',
            eventsDiscovered: run.discovered,
            eventsUpdated: run.inserted + run.updated,
            durationMs: Date.now() - run.t0,
            errorMessage: run.errorMessage,
          })
          .catch((err) => log.warn(`Could not write sync log for ${run.sourceName}`, err.message))
      }
    }

    // ---- 2. Dedupe across sources, then against the stored catalogue ------
    const incoming = fetched.filter(Boolean).flatMap((f) => f.records ?? [])
    if (!incoming.length) {
      summary.finishedAt = new Date().toISOString()
      summary.durationMs = Date.now() - startedMs
      await store.setMeta('lastSyncAt', summary.finishedAt)
      // A run that fetched nothing still has to be logged, or the source's
      // throttle will retry it immediately forever with no record of why.
      await writeRunLogs()
      publish(EVENTS.SYNC_COMPLETE, summary)
      return summary
    }

    const existing = await store.findHackathonCandidates()

    // Group incoming records together AND against a sample of the catalogue so
    // an event already stored from Devpost collapses with a fresh Devfolio row.
    const combined = [
      ...incoming.map((r) => ({ ...r, __incoming: true })),
      ...existing.slice(0, 1500).map((r) => ({ ...r, __incoming: false })),
    ]
    const { records: winners, clusters } = dedupe(combined)

    // Write a cluster when it contains at least one freshly fetched record.
    // - winner is incoming  -> a genuinely new event, upsert inserts it
    // - winner is stored    -> the event is known; upsert refreshes it in place
    const toWrite = []
    for (let i = 0; i < winners.length; i += 1) {
      const winner = winners[i]
      const cluster = clusters[i] ?? []
      const hasIncoming = cluster.some((c) => c.__incoming)
      if (!hasIncoming) continue

      const payload = { ...winner }
      delete payload.__incoming
      delete payload.__storedMatches
      payload.__duplicateCount = Math.max(0, cluster.length - 1)
      toWrite.push(payload)
    }

    const existingSlugs = new Set(existing.map((h) => h.slug).filter(Boolean))
    const finalised = finalise(toWrite, { existingSlugs })

    // ---- 3. Persist -------------------------------------------------------
    const { inserted, updated } = await store.upsertHackathons(finalised)
    summary.inserted = inserted.length
    summary.updated = updated.length

    // Attribute the catalogue-level counts back to the source each winning
    // record came from. A dedupe cluster's winner keeps its own `sourceName`,
    // so that is the source that actually contributed the record. The guard
    // matters: a stored record can win a cluster against a freshly fetched
    // duplicate, in which case the winner's source may not be one this run
    // fetched, and it must not be credited with a run it did not perform.
    const attribute = (rows, key) => {
      for (const row of rows) {
        const run = runs.get(row.sourceName)
        if (run) run[key] += 1
      }
    }
    attribute(inserted, 'inserted')
    attribute(updated, 'updated')

    for (const row of inserted) {
      publish(EVENTS.HACKATHON_INSERTED, { hackathon: toPublicHackathon(row) })
    }
    for (const row of updated) {
      publish(EVENTS.HACKATHON_UPDATED, { hackathon: toPublicHackathon(row) })
    }

    // ---- 4. Expire finished events ---------------------------------------
    try {
      summary.expired = await store.markExpired()
    } catch (err) {
      log.warn('Expiry pass failed', err.message)
    }

    // ---- 5. Lazily enrich a bounded number of events with full detail ------
    const budget = Number(enrichBudget ?? config.sync.enrichmentBudget)
    if (budget > 0) {
      try {
        const enriched = await enrichDetails(budget)
        summary.enriched = enriched.count
      } catch (err) {
        log.warn('Enrichment pass failed', err.message)
      }
    }

    // ---- 6. Queue notifications for genuinely new discoveries -------------
    try {
      const { dispatchForNewHackathons } = await import('../services/notifications.js')
      const queued = await dispatchForNewHackathons(inserted)
      summary.notificationsQueued = queued
    } catch (err) {
      log.warn('Notification dispatch failed', err.message)
    }

    const finishedAt = new Date().toISOString()
    summary.finishedAt = finishedAt
    summary.durationMs = Date.now() - startedMs
    lastRunAt = finishedAt
    await store.setMeta('lastSyncAt', finishedAt)

    // Written before the completion log so the UI never shows a finished run
    // whose per-source history has not landed yet.
    await writeRunLogs()

    log.info('Sync complete', {
      discovered: summary.discovered,
      inserted: summary.inserted,
      updated: summary.updated,
      enriched: summary.enriched,
      errors: summary.errors,
      durationMs: summary.durationMs,
    })

    publish(EVENTS.SYNC_COMPLETE, summary)
    return summary
  } catch (err) {
    log.error('Sync failed', err)
    summary.error = String(err?.message ?? err)
    return summary
  } finally {
    running = false
  }
}

/**
 * Fetch full detail pages for a bounded number of events that lack them.
 * Devpost in particular exposes overview/judging/prize text only on the event's
 * own subdomain, which is fetched on demand rather than for all 170+ events.
 */
export async function enrichDetails(budget = 20, { forceId } = {}) {
  const store = getStore()
  const nowIso = now().toISOString()

  let targets = []
  if (forceId) {
    const record = await store.getHackathonById(forceId)
    if (record) targets = [record]
  } else {
    const candidates = await store.findHackathonCandidates()
    targets = candidates
      .filter((h) => !h.description && getSource(h.sourceName))
      .sort((a, b) => new Date(b.firstDiscoveredAt ?? 0) - new Date(a.firstDiscoveredAt ?? 0))
      .slice(0, budget)
    // Also refresh stale detail on events whose last enrichment is old.
    if (targets.length < budget) {
      const stale = candidates
        .filter(
          (h) =>
            h.description &&
            getSource(h.sourceName) &&
            h.lastVerifiedAt &&
            Date.now() - new Date(h.lastVerifiedAt).getTime() > 14 * 86_400_000,
        )
        .slice(0, budget - targets.length)
      targets = targets.concat(stale)
    }
  }

  if (!targets.length) return { count: 0, ids: [] }

  const ids = []
  let count = 0

  for (const record of targets) {
    const source = getSource(record.sourceName)
    if (!source?.fetchDetail) continue
    try {
      const patch = await source.fetchDetail(record)
      if (!patch || Object.keys(patch).length === 0) continue
      const { id, slug, ...rest } = patch
      void id
      void slug
      const { updated: updatedRows, inserted: insertedRows } = await store.upsertHackathons([
        sanitiseFields({
          ...record,
          ...rest,
          slug: record.slug,
          firstDiscoveredAt: record.firstDiscoveredAt,
          lastVerifiedAt: nowIso,
        }),
      ])
      const saved = updatedRows[0] ?? insertedRows[0] ?? record
      if (saved) {
        publish(EVENTS.HACKATHON_UPDATED, { hackathon: toPublicHackathon(saved) })
        ids.push(String(saved.id))
        count += 1
      }
    } catch (err) {
      log.warn(`Enrichment failed for ${record.title}`, err.message)
    }
  }

  log.info(`Enriched ${count}/${targets.length} events`)
  return { count, ids }
}

export function getSyncStatus() {
  return { running, lastRunAt }
}
