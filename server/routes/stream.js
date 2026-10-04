import { Router } from 'express'
import { EVENTS, subscribe } from '../lib/events.js'
import { asyncHandler } from '../lib/routeHelpers.js'
import { getStore } from '../db/index.js'

const router = Router()

/**
 * Server-Sent Events stream for live hackathon updates.
 *
 * SSE (rather than WebSockets) because the traffic is one-directional, it
 * survives proxies, and it reconnects automatically in every browser. This is
 * the "equivalent supported mechanism" to Supabase Realtime: the same events
 * are published either way, so a deployment with Supabase can additionally
 * enable Postgres change-data-capture and the client will receive both without
 * modification.
 *
 * Events:
 *   hello    — initial snapshot metadata
 *   inserted — a hackathon was discovered for the first time
 *   updated  — an existing hackathon's details changed upstream
 *   expired  — an event passed and was marked completed
 *   sync     — a full sync run finished (with its summary)
 */
router.get('/', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Disable nginx buffering so events are delivered immediately.
    'X-Accel-Buffering': 'no',
  })
  res.status(200)
  res.flushHeaders?.()

  const send = (event, payload, id) => {
    if (id) res.write(`id: ${id}\n`)
    res.write(`event: ${event}\n`)
    res.write(`data: ${JSON.stringify(payload)}\n\n`)
  }

  const store = getStore()
  Promise.all([store.getMeta('lastSyncAt'), store.lastSuccessfulSync()])
    .then(([lastSyncAt, lastSuccess]) => {
      send('hello', {
        store: store.driver,
        lastSyncAt: lastSyncAt ?? null,
        lastSuccessfulSync: lastSuccess ?? null,
        connectedAt: new Date().toISOString(),
      })
    })
    .catch(() => send('hello', { connectedAt: new Date().toISOString() }))

  const clean = (row) => ({
    id: row?.id ? String(row.id) : undefined,
    title: row?.title,
    slug: row?.slug,
    organizer: row?.organizer,
    sourceName: row?.sourceName,
    category: row?.category,
    technologies: row?.technologies ?? [],
    bannerUrl: row?.bannerUrl ?? null,
    startDate: row?.startDate ?? null,
    registrationDeadline: row?.registrationDeadline ?? null,
    eventFormat: row?.eventFormat ?? null,
    country: row?.country ?? null,
    firstDiscoveredAt: row?.firstDiscoveredAt ?? null,
    registrationUrl: row?.registrationUrl ?? null,
    officialUrl: row?.officialUrl ?? null,
  })

  const unsubscribers = [
    subscribe(EVENTS.HACKATHON_INSERTED, ({ hackathon }) =>
      send('inserted', { hackathon: clean(hackathon) }),
    ),
    subscribe(EVENTS.HACKATHON_UPDATED, ({ hackathon }) =>
      send('updated', { hackathon: clean(hackathon) }),
    ),
    subscribe(EVENTS.HACKATHON_EXPIRED, ({ hackathon }) =>
      send('expired', { hackathon: clean(hackathon) }),
    ),
    subscribe(EVENTS.SYNC_COMPLETE, (summary) => send('sync', summary)),
  ]

  // Keep intermediaries from closing an idle connection.
  const heartbeat = setInterval(() => res.write(`: ping ${Date.now()}\n\n`), 20_000)
  if (heartbeat.unref) heartbeat.unref()

  const close = () => {
    clearInterval(heartbeat)
    for (const off of unsubscribers) off()
    if (!res.writableEnded) res.end()
  }

  req.on('close', close)
  req.on('error', close)
  res.on('error', close)
})

/** GET /api/stream/status — cheap polling fallback for environments that block SSE. */
router.get(
  '/status',
  asyncHandler(async (_req, res) => {
    const store = getStore()
    const [lastSyncAt, lastSuccess, logs] = await Promise.all([
      store.getMeta('lastSyncAt'),
      store.lastSuccessfulSync(),
      store.listSyncLogs({ limit: 10 }),
    ])
    res.json({
      store: store.driver,
      lastSyncAt: lastSyncAt ?? null,
      lastSuccessfulSync: lastSuccess ?? null,
      recentRuns: logs,
    })
  }),
)

export default router
