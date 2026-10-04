import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { config } from '../config.js'
import { getStore } from '../db/index.js'
import { asyncHandler, HttpError } from '../lib/routeHelpers.js'
import { attachUser, requireAuth } from '../services/auth.js'
import { EVENTS, subscribe } from '../lib/events.js'
import { initPush, isPushEnabled } from '../services/push.js'
import { isEmailEnabled } from '../services/email.js'
import { CATEGORIES } from '../../shared/taxonomy.js'

const router = Router()
router.use(attachUser)

const writeLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.writeMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many requests. Please slow down.' },
})

/** GET /api/notifications */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const store = getStore()
    const limit = Math.min(Number(req.query.limit) || 50, 100)
    const unreadOnly = req.query.unread === 'true'
    const [items, unread] = await Promise.all([
      store.listNotifications(req.user.id, { limit, unreadOnly }),
      store.countUnreadNotifications(req.user.id),
    ])
    res.json({ items, unreadCount: unread, unreadOnly })
  }),
)

/** GET /api/notifications/unread-count — polled by the nav badge. */
router.get(
  '/unread-count',
  requireAuth,
  asyncHandler(async (req, res) => {
    const store = getStore()
    res.json({ unreadCount: await store.countUnreadNotifications(req.user.id) })
  }),
)

router.post(
  '/:id/read',
  requireAuth,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const store = getStore()
    const ok = await store.markNotificationRead(req.user.id, req.params.id)
    if (!ok) throw new HttpError(404, 'not_found', 'That notification no longer exists.')
    res.json({ ok: true, unreadCount: await store.countUnreadNotifications(req.user.id) })
  }),
)

router.post(
  '/read-all',
  requireAuth,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const store = getStore()
    const changed = await store.markAllNotificationsRead(req.user.id)
    res.json({ ok: true, markedRead: changed, unreadCount: 0 })
  }),
)

router.delete(
  '/',
  requireAuth,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const store = getStore()
    await store.deleteAllNotifications(req.user.id)
    res.json({ ok: true, unreadCount: 0 })
  }),
)

// ------------------------------------------------------------ web push --

/**
 * GET /api/notifications/push/key
 * The browser needs the VAPID public key to call PushManager.subscribe().
 * Returns `enabled: false` with an explanation when keys are not configured,
 * so the UI can disable the control honestly instead of failing at subscribe().
 */
router.get('/push/key', (_req, res) => {
  res.json({
    enabled: isPushEnabled(),
    publicKey: isPushEnabled() ? config.push.publicKey : null,
    explanation: isPushEnabled()
      ? null
      : 'Web Push requires VAPID keys. Generate them with `npx web-push generate-vapid-keys` and set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY in .env.',
  })
})

router.post(
  '/push/subscribe',
  requireAuth,
  writeLimiter,
  asyncHandler(async (req, res) => {
    if (!initPush()) {
      throw new HttpError(503, 'push_not_configured', 'Web Push is not configured on this server.')
    }
    const store = getStore()
    const body = z
      .object({
        endpoint: z.string().url().max(1000),
        keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(200) }),
      })
      .parse(req.body)

    await store.savePushSubscription(req.user.id, {
      ...body,
      userAgent: req.get('user-agent')?.slice(0, 300) ?? null,
    })
    res.status(201).json({ ok: true })
  }),
)

router.post(
  '/push/unsubscribe',
  requireAuth,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const store = getStore()
    const body = z.object({ endpoint: z.string().url().max(1000) }).parse(req.body)
    await store.removePushSubscription(req.user.id, body.endpoint)
    res.json({ ok: true })
  }),
)

router.post(
  '/push/test',
  requireAuth,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const store = getStore()
    const subs = await store.listPushSubscriptions(req.user.id)
    if (!subs.length) {
      throw new HttpError(400, 'no_subscriptions', 'No active push subscription found for your account.')
    }
    const { sendPushToUser } = await import('../services/push.js')
    const result = await sendPushToUser(req.user.id, [
      {
        title: 'HackRadar push is working',
        message: 'You will be alerted here when new hackathons match your interests.',
      },
    ])
    res.json({ ok: true, ...result })
  }),
)

/** GET /api/notifications/preferences — capability + current settings. */
router.get(
  '/preferences',
  requireAuth,
  asyncHandler(async (req, res) => {
    const store = getStore()
    const subscriptions = await store.listSubscriptions(req.user.id)
    res.json({
      capabilities: {
        inApp: true,
        push: isPushEnabled(),
        email: isEmailEnabled(),
      },
      preferences: req.user.notificationPreferences ?? {},
      preferredCategories: req.user.preferredCategories ?? [],
      preferredTechnologies: req.user.preferredTechnologies ?? [],
      subscriptions,
      categoryOptions: CATEGORIES.map((c) => ({ key: c.key, label: c.label })),
      explanations: {
        inApp: 'In-app notifications appear in the notification centre and update live. Always available.',
        push: isPushEnabled()
          ? 'Browser push notifications require your explicit permission and work while HackRadar is closed.'
          : 'Not configured on this server. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to enable.',
        email: isEmailEnabled()
          ? 'Email digests and alerts are sent to your account address.'
          : 'Not configured on this server. Set EMAIL_PROVIDER with SMTP_* or RESEND_API_KEY to enable.',
        quietHours:
          'During quiet hours in-app and push alerts are held back. Email is unaffected. Times are UTC.',
      },
    })
  }),
)

/** GET /api/notifications/stream — live notification counter (SSE). */
router.get('/stream', requireAuth, (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.flushHeaders?.()

  const send = (event, payload) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
  }

  send('ready', { ok: true })

  const unsubscribe = subscribe(EVENTS.NOTIFICATION_CREATED, (payload) => {
    if (payload.userId !== req.user.id) return
    send('notification', payload)
  })

  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000)
  if (heartbeat.unref) heartbeat.unref()

  req.on('close', () => {
    clearInterval(heartbeat)
    unsubscribe()
    res.end()
  })
})

export default router
