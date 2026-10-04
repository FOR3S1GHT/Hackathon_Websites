import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { config } from '../config.js'
import { getStore } from '../db/index.js'
import { asyncHandler, HttpError } from '../lib/routeHelpers.js'
import { attachUser, defaultNotificationPreferences, requireAuth } from '../services/auth.js'
import { toPublicHackathon } from '../pipeline/normalize.js'
import { effectiveStatus } from '../services/search.js'
import { daysUntil, formatDateRange, now } from '../lib/dates.js'
import { SUBSCRIPTION_TYPES } from '../services/notifications.js'

const router = Router()
router.use(attachUser)

const writeLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.writeMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many requests. Please slow down.' },
})

const decorate = (record, reference = now()) =>
  toPublicHackathon(record, {
    derivedStatus: effectiveStatus(record, reference),
    daysToRegistrationDeadline: daysUntil(record.registrationDeadline, reference),
    dateRangeLabel: formatDateRange(record.startDate, record.endDate),
  })

/** PATCH /api/me — profile and preferences. */
router.patch(
  '/me',
  requireAuth,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const store = getStore()
    const body = z
      .object({
        displayName: z.string().trim().min(1).max(80).optional(),
        avatarUrl: z.string().url().max(500).nullish(),
        preferredCategories: z.array(z.string().max(60)).max(30).optional(),
        preferredTechnologies: z.array(z.string().max(60)).max(60).optional(),
        notificationPreferences: z
          .object({
            enabled: z.boolean().optional(),
            inApp: z.boolean().optional(),
            push: z.boolean().optional(),
            email: z.boolean().optional(),
            categories: z.array(z.string().max(60)).max(30).optional(),
            technologies: z.array(z.string().max(60)).max(60).optional(),
            quietHoursEnabled: z.boolean().optional(),
            quietHoursStart: z.number().int().min(0).max(23).optional(),
            quietHoursEnd: z.number().int().min(0).max(23).optional(),
          })
          .optional(),
      })
      .parse(req.body)

    const current = (await store.getProfile(req.user.id)) ?? {}
    const updated = await store.upsertProfile({
      ...current,
      id: req.user.id,
      displayName: body.displayName ?? current.displayName,
      avatarUrl: body.avatarUrl !== undefined ? body.avatarUrl : current.avatarUrl,
      preferredCategories: body.preferredCategories ?? current.preferredCategories ?? [],
      preferredTechnologies: body.preferredTechnologies ?? current.preferredTechnologies ?? [],
      notificationPreferences: {
        ...defaultNotificationPreferences(),
        ...(current.notificationPreferences ?? {}),
        ...(body.notificationPreferences ?? {}),
      },
    })

    res.json({ user: updated })
  }),
)

/** GET /api/me/dashboard — everything the personalised dashboard needs. */
router.get(
  '/me/dashboard',
  requireAuth,
  asyncHandler(async (req, res) => {
    const store = getStore()
    const reference = now()
    const [bookmarks, ideas, notifications, subs, unread] = await Promise.all([
      store.listBookmarks(req.user.id),
      store.listProjectIdeas(req.user.id),
      store.listNotifications(req.user.id, { limit: 8 }),
      store.listSubscriptions(req.user.id),
      store.countUnreadNotifications(req.user.id),
    ])

    const decorated = bookmarks.map((b) => decorate(b, reference))

    // Deadline rollup across bookmarked events — the dashboard's main job.
    const upcomingDeadlines = decorated
      .filter((b) => b.registrationDeadline && daysUntil(b.registrationDeadline, reference) >= 0)
      .sort((a, b) => new Date(a.registrationDeadline) - new Date(b.registrationDeadline))
      .slice(0, 6)

    const interests = {
      categories: req.user.preferredCategories ?? [],
      technologies: req.user.preferredTechnologies ?? [],
    }

    // Personalised recommendations: bookmarked categories and technologies first.
    const bookmarkedCategories = new Set(bookmarks.map((b) => b.category).filter(Boolean))
    const bookmarkedTech = new Set(bookmarks.flatMap((b) => b.technologies ?? []))
    const all = await store.findHackathonCandidates()
    const suggested = all
      .filter(
        (h) =>
          effectiveStatus(h, reference) !== 'completed' &&
          !bookmarks.some((b) => b.id === String(h.id)),
      )
      .map((h) => {
        let score = 0
        if (bookmarkedCategories.has(h.category)) score += 5
        score += (h.technologies ?? []).filter((t) => bookmarkedTech.has(t)).length * 2
        if ((interests.categories ?? []).includes(h.category)) score += 4
        if (h.registrationOpen) score += 2
        if (daysUntil(h.startDate, reference) !== null && daysUntil(h.startDate, reference) <= 45) score += 3
        return { hackathon: h, score }
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((s) => decorate(s.hackathon, reference))

    res.json({
      stats: {
        bookmarks: decorated.length,
        ideas: ideas.length,
        unreadNotifications: unread,
        activeSubscriptions: subs.filter((s) => s.active).length,
      },
      bookmarks: decorated,
      upcomingDeadlines,
      projectIdeas: ideas,
      recentNotifications: notifications,
      subscriptions: subs,
      suggestions: suggested,
    })
  }),
)

// ------------------------------------------------------------- bookmarks --

router.get(
  '/me/bookmarks',
  requireAuth,
  asyncHandler(async (req, res) => {
    const store = getStore()
    const reference = now()
    const bookmarks = await store.listBookmarks(req.user.id)
    res.json({ items: bookmarks.map((b) => decorate(b, reference)) })
  }),
)

router.get(
  '/me/bookmarks/ids',
  requireAuth,
  asyncHandler(async (req, res) => {
    const store = getStore()
    res.json({ ids: await store.listBookmarkedIds(req.user.id) })
  }),
)

router.post(
  '/me/bookmarks/:hackathonId',
  requireAuth,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const store = getStore()
    const hackathon = await store.getHackathonById(req.params.hackathonId)
    if (!hackathon) throw new HttpError(404, 'not_found', 'That hackathon no longer exists.')
    const created = await store.addBookmark(req.user.id, hackathon.id)
    res.status(created ? 201 : 200).json({ ok: true, bookmarked: true, ids: await store.listBookmarkedIds(req.user.id) })
  }),
)

router.delete(
  '/me/bookmarks/:hackathonId',
  requireAuth,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const store = getStore()
    await store.removeBookmark(req.user.id, req.params.hackathonId)
    res.json({ ok: true, bookmarked: false, ids: await store.listBookmarkedIds(req.user.id) })
  }),
)

// --------------------------------------------------------- project ideas --

router.get(
  '/me/ideas',
  requireAuth,
  asyncHandler(async (req, res) => {
    const store = getStore()
    res.json({ items: await store.listProjectIdeas(req.user.id) })
  }),
)

router.post(
  '/me/ideas',
  requireAuth,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const store = getStore()
    const body = z
      .object({
        hackathonId: z.string().min(1).max(64).optional(),
        hackathonTitle: z.string().max(200).nullish(),
        title: z.string().trim().min(1).max(120),
        description: z.string().trim().max(2000).nullish(),
        problem: z.string().max(1000).nullish(),
        targetUsers: z.string().max(500).nullish(),
        difficulty: z.enum(['beginner', 'intermediate', 'advanced']).default('intermediate'),
        technologies: z.array(z.string().max(60)).max(20).default([]),
        keyFeatures: z.array(z.string().max(300)).max(12).default([]),
        implementationSteps: z.array(z.string().max(300)).max(12).default([]),
        estimatedTime: z.string().max(60).nullish(),
        demoTips: z.array(z.string().max(300)).max(6).default([]),
        source: z.enum(['rule-based', 'ai', 'user']).default('user'),
      })
      .parse(req.body)

    const created = await store.createProjectIdea({ userId: req.user.id, ...body })
    res.status(201).json({ idea: created })
  }),
)

router.delete(
  '/me/ideas/:id',
  requireAuth,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const store = getStore()
    const deleted = await store.deleteProjectIdea(req.user.id, req.params.id)
    if (!deleted) throw new HttpError(404, 'not_found', 'That project idea no longer exists.')
    res.json({ ok: true })
  }),
)

// --------------------------------------------------------- subscriptions --

router.get(
  '/me/subscriptions',
  requireAuth,
  asyncHandler(async (req, res) => {
    const store = getStore()
    res.json({
      items: await store.listSubscriptions(req.user.id),
      availableTypes: Object.entries(SUBSCRIPTION_TYPES).map(([key, value]) => ({ key, value })),
    })
  }),
)

router.put(
  '/me/subscriptions/:type',
  requireAuth,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const store = getStore()
    const type = z.string().max(60).parse(req.params.type)
    const allowed = Object.values(SUBSCRIPTION_TYPES)
    if (!allowed.includes(type)) {
      throw new HttpError(400, 'invalid_type', `Unknown subscription type "${type}".`, { allowed })
    }
    const body = z
      .object({
        active: z.boolean().default(true),
        subscriptionData: z.record(z.unknown()).default({}),
      })
      .parse(req.body ?? {})

    const saved = await store.upsertSubscription(req.user.id, type, body.subscriptionData, body.active)
    res.json({ subscription: saved })
  }),
)

router.delete(
  '/me/subscriptions/:type',
  requireAuth,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const store = getStore()
    const type = z.string().max(60).parse(req.params.type)
    await store.deleteSubscription(req.user.id, type)
    res.json({ ok: true })
  }),
)

export default router
