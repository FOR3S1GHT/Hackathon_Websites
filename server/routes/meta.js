import { Router } from 'express'
import { config, publicConfig } from '../config.js'
import { getStore } from '../db/index.js'
import { asyncHandler } from '../lib/routeHelpers.js'
import { describeSources, UNAVAILABLE_SOURCES } from '../sources/index.js'
import { describeAi } from '../services/ai.js'
import { isPushEnabled } from '../services/push.js'
import { isEmailEnabled } from '../services/email.js'
import { getSyncStatus } from '../pipeline/sync.js'
import { relativeTime } from '../lib/dates.js'

const router = Router()

/** Render a poll interval in the largest unit that still reads naturally. */
function describeMinutes(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return 'off'
  if (minutes < 60) return `${minutes} min`
  if (minutes % 60 === 0) return `${minutes / 60} hr`
  return `${minutes} min`
}

/**
 * A one-line, human-readable statement of the polling window.
 *
 * The previous wording said "see perSourceIntervalMinutes", which leaked a
 * config key name into user-facing prose and told a reader nothing about how
 * stale the catalogue could actually get. The bound is computed from the live
 * config so the sentence stays true when the intervals are retuned.
 */
function pollIntervalDisclosure() {
  const values = Object.values(config.sync.perSourceIntervalMinutes).filter(
    (n) => Number.isFinite(n) && n > 0,
  )
  if (!values.length) {
    return 'HackRadar polls each source on a schedule. New events appear in the catalogue within one interval of the organiser publishing them — this is not instant, and the platform does not claim to be.'
  }
  const fastest = Math.min(...values)
  const slowest = Math.max(...values)
  const window =
    fastest === slowest
      ? `every ${describeMinutes(fastest)}`
      : `every ${describeMinutes(fastest)} to ${describeMinutes(slowest)}`
  return `HackRadar polls each source on its own schedule, ${window} depending on the volume the platform publishes. A new listing therefore appears here within roughly one polling interval of the organiser publishing it — most often sooner, and never later than that interval plus the sync itself takes. This is not instant, and the platform does not claim to be.`
}

/**
 * GET /api/meta
 * One call that tells the frontend everything it needs about backend
 * capabilities, so the UI can enable/disable features honestly (e.g. showing
 * "AI ideas unavailable" instead of a button that silently fails).
 */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const store = getStore()
    const [stats, lastSyncAt, lastSuccess, logs] = await Promise.all([
      store.stats(),
      store.getMeta('lastSyncAt'),
      store.lastSuccessfulSync(),
      store.listSyncLogs({ limit: 12 }),
    ])

    res.json({
      app: { name: 'HackRadar', version: '1.0.0' },
      env: config.env,
      store: store.driver,
      capabilities: {
        ...publicConfig(),
        // Exposed because the Data Sources page states it, and a page that
        // renders "0 records per run" while 38 records are being enriched on
        // every run is simply wrong. It was read by the UI and never sent.
        enrichmentBudget: config.sync.enrichmentBudget,
        ai: describeAi(),
        push: isPushEnabled(),
        email: isEmailEnabled(),
      },
      sync: {
        cron: config.sync.cron,
        running: getSyncStatus().running,
        // `lastSyncAt` is the last sync *attempt*. `lastRefreshedAt` is when a
        // source last actually completed a run and wrote its rows — the only
        // value that may back a "catalogue last refreshed" claim, because a
        // run in which every source was inside its poll interval completes in
        // ~0 ms, writes nothing, and still bumps `lastSyncAt`.
        lastSyncAt: lastSyncAt ?? null,
        lastSyncRelative: lastSyncAt ? relativeTime(lastSyncAt) : null,
        lastRefreshedAt: lastSuccess?.syncCompletedAt ?? lastSuccess?.syncStartedAt ?? null,
        lastSuccessfulSync: lastSuccess ?? null,
        perSourceIntervalMinutes: config.sync.perSourceIntervalMinutes,
        perSourceIntervalSummary: Object.entries(config.sync.perSourceIntervalMinutes)
          .map(([name, minutes]) => `${name} ${describeMinutes(minutes)}`)
          .join(' · '),
        recentRuns: logs.map((l) => ({
          sourceName: l.sourceName,
          status: l.status,
          syncStartedAt: l.syncStartedAt,
          syncCompletedAt: l.syncCompletedAt,
          eventsDiscovered: l.eventsDiscovered,
          eventsUpdated: l.eventsUpdated,
          durationMs: l.durationMs ?? null,
          errorMessage: l.errorMessage ?? null,
        })),
        disclosure: pollIntervalDisclosure(),
      },
      stats,
      sources: describeSources(),
      unavailableSources: UNAVAILABLE_SOURCES,
    })
  }),
)

/**
 * GET /api/health — liveness + readiness.
 *
 * Mounted directly in server/index.js (before the rate limiter) so an uptime
 * probe is never the thing that gets rate-limited.
 */
export function healthHandler(_req, res) {
  const store = getStore()
  let healthy = true
  let detail = null
  try {
    // A resolved promise here is deliberate: this handler is synchronous so it
    // can answer even when the store is unhealthy, which is exactly when a
    // probe needs an answer.
    store.getMeta('lastSyncAt')
  } catch (err) {
    healthy = false
    detail = err.message
  }
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    store: store.driver,
    uptimeSeconds: Math.round(process.uptime()),
    ...(detail ? { detail } : {}),
  })
}

export default router
