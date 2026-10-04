import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { config } from '../config.js'
import { getStore } from '../db/index.js'
import { createLogger } from '../lib/logger.js'
import { HttpError, asyncHandler } from '../lib/routeHelpers.js'
import {
  attachUser, clearSessionCookie, defaultNotificationPreferences, issueLocalToken,
  requestPasswordReset, setSessionCookie, signInLocal, signUpLocal,
} from '../services/auth.js'

const log = createLogger('route:auth')
const router = Router()

router.use(attachUser)

const authLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: 'Too many attempts. Please wait a minute and try again.' },
})

const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address.').max(254)
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(200, 'Password is too long.')

/** Which auth stack the client should use. */
router.get('/mode', (req, res) => {
  res.json({
    mode: config.supabase.url && config.supabase.anonKey ? 'supabase' : 'local',
    supabaseUrl: config.supabase.url || null,
    supabaseAnonKey: config.supabase.anonKey || null,
  })
})

/** GET /api/auth/me */
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    if (!req.user) {
      return res.json({ user: null, authMode: config.supabase.url ? 'supabase' : 'local' })
    }
    const store = getStore()
    const bookmarkedIds = await store.listBookmarkedIds(req.user.id)
    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        displayName: req.user.displayName,
        avatarUrl: req.user.avatarUrl,
        preferredCategories: req.user.preferredCategories ?? [],
        preferredTechnologies: req.user.preferredTechnologies ?? [],
        notificationPreferences: req.user.notificationPreferences ?? defaultNotificationPreferences(),
      },
      bookmarkedIds,
      authMode: config.supabase.url && config.supabase.anonKey ? 'supabase' : 'local',
    })
  }),
)

/** POST /api/auth/signup — local mode only (Supabase handles its own signup). */
router.post(
  '/signup',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        email: emailSchema,
        password: passwordSchema,
        displayName: z.string().trim().min(1).max(80).optional(),
      })
      .parse(req.body)

    try {
      const user = await signUpLocal(body)
      const token = await issueLocalToken(user)
      setSessionCookie(res, token)
      log.info(`Local signup: ${body.email}`)
      res.status(201).json({
        user: { id: user.id, email: user.email, displayName: user.displayName },
        token,
      })
    } catch (err) {
      if (err.code === 'email_taken') {
        throw new HttpError(409, 'email_taken', err.message)
      }
      throw err
    }
  }),
)

/** POST /api/auth/login */
router.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = z.object({ email: emailSchema, password: z.string().min(1).max(200) }).parse(req.body)
    try {
      const user = await signInLocal(body)
      const token = await issueLocalToken(user)
      setSessionCookie(res, token)
      res.json({
        user: { id: user.id, email: user.email, displayName: user.displayName },
        token,
      })
    } catch (err) {
      if (err.code === 'invalid_credentials') {
        throw new HttpError(401, 'invalid_credentials', err.message)
      }
      throw err
    }
  }),
)

/** POST /api/auth/logout */
router.post('/logout', (req, res) => {
  clearSessionCookie(res)
  res.json({ ok: true })
})

/**
 * POST /api/auth/password-reset
 * Honest about capability: without a configured email provider there is nowhere
 * to deliver a reset link, so we say so instead of pretending to send one.
 */
router.post(
  '/password-reset',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = z.object({ email: emailSchema }).parse(req.body)
    const result = await requestPasswordReset(body.email)
    res.json({
      ok: true,
      delivered: result.delivered,
      message: result.delivered
        ? `A password reset link has been sent to ${body.email}.`
        : 'Password reset requires an email provider. Set EMAIL_PROVIDER plus SMTP_* or RESEND_API_KEY to enable it — see .env.example.',
    })
  }),
)

export default router
