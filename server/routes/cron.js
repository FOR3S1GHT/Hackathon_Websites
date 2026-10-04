import { Router } from 'express'
import { z } from 'zod'
import { config } from '../config.js'
import { getStore } from '../db/index.js'
import { createLogger } from '../lib/logger.js'
import { asyncHandler, HttpError } from '../lib/routeHelpers.js'
import { runSync } from '../pipeline/sync.js'
import { buildDailyDigest, dispatchDeadlineReminders } from '../services/notifications.js'

const log = createLogger('route:cron')
const router = Router()

/**
 * External scheduler entry point.
 *
 * The in-process node-cron scheduler already runs sync on SYNC_CRON, but on
 * platforms that idle or freeze Node (Vercel functions, Netlify, Cloudflare)
 * the scheduler never fires. Point an external scheduler here instead:
 *
 *   Vercel Cron      -> { "crons": [{ "path": "/api/cron/sync",
 *                                     "schedule": "every 30 minutes" }] }
 *   GitHub Actions   -> run: curl -fsS "$APP_URL/api/cron/sync" -H "Authorization: Bearer $CRON_SECRET"
 *   Cloud Scheduler  -> same curl
 *
 * CRON_SECRET is required whenever it is set; when it is unset the route is
 * open, which is convenient locally but should not be the case in production.
 */
function guard(req, res, next) {
  if (!config.sync.cronSecret) return next()
  const header = req.get('authorization') ?? ''
  const provided = header.replace(/^Bearer\s+/i, '') || req.query.secret
  if (provided && provided === config.sync.cronSecret) return next()
  return res.status(401).json({ error: 'unauthorized', message: 'A valid CRON_SECRET is required.' })
}

const syncQuery = z
  .object({
    sources: z.union([z.string(), z.array(z.string())]).optional(),
    force: z.enum(['true', 'false']).optional(),
    enrich: z.coerce.number().int().min(0).max(200).optional(),
  })
  .optional()

/** POST|GET /api/cron/sync — run a data synchronization now. */
const handleSync = asyncHandler(async (req, res) => {
  const parsed = syncQuery.parse(req.query) ?? {}
  const sources = parsed.sources
    ? (Array.isArray(parsed.sources) ? parsed.sources : String(parsed.sources).split(','))
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined

  const force = parsed.force === 'true'
  log.info(`Cron sync requested${sources ? ` (${sources.join(', ')})` : ''}${force ? ' [forced]' : ''}`)

  const summary = await runSync({ sources, force, enrichBudget: parsed.enrich })

  res.json({ ok: !summary.error, summary })
})

router.get('/sync', guard, handleSync)
router.post('/sync', guard, handleSync)

/** POST /api/cron/deadlines — deadline reminder pass. */
router.post(
  '/deadlines',
  guard,
  asyncHandler(async (_req, res) => {
    const created = await dispatchDeadlineReminders()
    res.json({ ok: true, created })
  }),
)

/** POST /api/cron/digest — build (and deliver, if configured) the daily digest. */
router.post(
  '/digest',
  guard,
  asyncHandler(async (_req, res) => {
    const digest = await buildDailyDigest()
    let delivered = 0
    if (digest.events.length) {
      const { sendEmail, isEmailEnabled, renderDigestHtml } = await import('../services/email.js')
      const store = getStore()
      const subs = (await store.listAllActiveSubscriptions()).filter(
        (s) => s.subscriptionType === 'daily_digest' && s.active,
      )
      for (const sub of subs) {
        const profile = await store.getProfile(sub.userId)
        if (!profile?.email || profile.notificationPreferences?.email !== true) continue
        const result = await sendEmail({
          to: profile.email,
          subject: `${digest.events.length} new hackathon${digest.events.length === 1 ? '' : 's'} on HackRadar`,
          text: digest.events.map((e) => `• ${e.title} — ${e.organizer ?? 'organiser'}`).join('\n'),
          html: renderDigestHtml(digest.events),
        })
        if (result.sent) delivered += 1
      }
      void isEmailEnabled
    }
    res.json({
      ok: true,
      recipients: digest.recipients,
      eventCount: digest.events.length,
      delivered,
      events: digest.events,
    })
  }),
)

/** GET /api/cron/verify — confirm a scheduler is pointed at a live backend. */
router.get('/verify', asyncHandler(async (_req, res) => {
  const store = getStore()
  if (!config.sync.cronSecret) {
    throw new HttpError(
      500,
      'no_cron_secret',
      'CRON_SECRET is not set, so /api/cron/sync is open to anyone. Set it before exposing this backend.',
    )
  }
  const [lastSyncAt, lastSuccess] = await Promise.all([
    store.getMeta('lastSyncAt'),
    store.lastSuccessfulSync(),
  ])
  res.json({ ok: true, store: store.driver, lastSyncAt, lastSuccessfulSync: lastSuccess })
}))

export default router
