import crypto from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import { createClient } from '@supabase/supabase-js'
import { config } from '../config.js'
import { createLogger } from '../lib/logger.js'
import { getStore } from '../db/index.js'

const log = createLogger('auth')

/**
 * Two authentication modes:
 *
 *  1. Supabase Auth (preferred). The browser signs in with the anon key and
 *     sends its Supabase access token as a Bearer header. We verify that token
 *     with the Supabase JWKS / secret, then trust the resulting `sub` as the
 *     user id. Row Level Security applies to direct browser access to Supabase.
 *
 *  2. Built-in local auth (fallback so the app works with zero credentials).
 *     Email + password with scrypt hashing, signed JWT in an httpOnly cookie.
 *     Passwords are never stored in plaintext and never logged.
 */

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 }
const SCRYPT_PREFIX = 'scrypt'

function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const derived = crypto.scryptSync(password, salt, SCRYPT_PARAMS.keylen, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
  })
  return `${SCRYPT_PREFIX}$${salt.toString('base64')}$${derived.toString('base64')}`
}

function verifyPassword(password, stored) {
  if (!stored?.startsWith(`${SCRYPT_PREFIX}$`)) return false
  const [, saltB64, hashB64] = stored.split('$')
  try {
    const salt = Buffer.from(saltB64, 'base64')
    const expected = Buffer.from(hashB64, 'base64')
    const derived = crypto.scryptSync(password, salt, expected.length, {
      N: SCRYPT_PARAMS.N,
      r: SCRYPT_PARAMS.r,
      p: SCRYPT_PARAMS.p,
    })
    return crypto.timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}

function jwtSecret() {
  return new TextEncoder().encode(config.auth.jwtSecret)
}

export async function issueLocalToken(user) {
  const ttlSeconds = config.auth.sessionTtlDays * 86_400
  return new SignJWT({
    email: user.email,
    name: user.displayName,
    // Marks the token as issued by HackRadar's own auth, not Supabase.
    mode: 'local',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setIssuer('hackradar')
    .setAudience('hackradar-web')
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(jwtSecret())
}

export async function verifyLocalToken(token) {
  const { payload } = await jwtVerify(token, jwtSecret(), {
    issuer: 'hackradar',
    audience: 'hackradar-web',
  })
  return { id: payload.sub, email: payload.email, displayName: payload.name }
}

let supabaseAdmin = null
function getSupabaseAdmin() {
  if (supabaseAdmin) return supabaseAdmin
  if (!config.supabase.url || !config.supabase.serviceRoleKey) return null
  supabaseAdmin = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return supabaseAdmin
}

/**
 * Resolve the current user from the request.
 *
 * Order: Authorization: Bearer <token> first (Supabase or local), then the
 * httpOnly cookie set by the local auth routes.
 */
export async function resolveUser(req) {
  const header = req.get('authorization')
  if (header?.toLowerCase().startsWith('bearer ')) {
    const token = header.slice(7).trim()
    if (!token) return null
    try {
      // Try local first (cheap, no network).
      try {
        const local = await verifyLocalToken(token)
        if (local) return await hydrateProfile(local)
      } catch {
        /* not a HackRadar token — fall through to Supabase */
      }
      const admin = getSupabaseAdmin()
      if (!admin) return null
      const { data, error } = await admin.auth.getUser(token)
      if (error || !data?.user) return null
      return await hydrateProfile({
        id: data.user.id,
        email: data.user.email,
        displayName:
          data.user.user_metadata?.display_name ||
          data.user.user_metadata?.full_name ||
          (data.user.email ? data.user.email.split('@')[0] : 'Hacker'),
        avatarUrl: data.user.user_metadata?.avatar_url ?? null,
      })
    } catch (err) {
      log.warn('Token resolution failed', err.message)
      return null
    }
  }

  const cookieToken = req.cookies?.[config.auth.cookieName]
  if (cookieToken) {
    try {
      const local = await verifyLocalToken(cookieToken)
      return await hydrateProfile(local)
    } catch {
      return null
    }
  }

  return null
}

async function hydrateProfile(identity) {
  const store = getStore()
  let profile = await store.getProfile(identity.id)
  if (!profile) {
    profile = await store.upsertProfile({
      id: identity.id,
      displayName: identity.displayName ?? null,
      email: identity.email ?? null,
      avatarUrl: identity.avatarUrl ?? null,
      preferredCategories: [],
      preferredTechnologies: [],
      notificationPreferences: defaultNotificationPreferences(),
    })
  }
  // The identity's id is authoritative: a profile row can never re-point the
  // session at a different account.
  return { ...profile, id: identity.id, email: identity.email ?? profile.email }
}

export function defaultNotificationPreferences() {
  return {
    inApp: true,
    push: false,
    email: false,
    categories: [],
    technologies: [],
    quietHoursEnabled: false,
    quietHoursStart: config.notifications.quietHoursDefault.start,
    quietHoursEnd: config.notifications.quietHoursDefault.end,
  }
}

/** Express middleware: attaches req.user (may be null). Never rejects. */
export async function attachUser(req, _res, next) {
  try {
    req.user = await resolveUser(req)
  } catch {
    req.user = null
  }
  next()
}

/** Express middleware: 401s anonymous requests to protected routes. */
export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'You must be signed in to perform this action.',
    })
  }
  next()
}

// ------------------------------------------------------------ local mode --

export async function signUpLocal({ email, password, displayName }) {
  const store = getStore()
  const normalised = String(email).trim().toLowerCase()
  const existing = store.allProfiles ? await store.allProfiles() : []

  if (existing.some((p) => p.email?.toLowerCase() === normalised)) {
    const error = new Error('An account with that email already exists.')
    error.code = 'email_taken'
    throw error
  }

  // Deterministic UUID so the id works identically in Postgres and the JSON store.
  const id = crypto.randomUUID()
  await store.upsertProfile({
    id,
    displayName: displayName?.trim() || normalised.split('@')[0],
    email: normalised,
    avatarUrl: null,
    passwordHash: hashPassword(password),
    authProvider: 'local',
    preferredCategories: [],
    preferredTechnologies: [],
    notificationPreferences: defaultNotificationPreferences(),
  })

  return { id, email: normalised, displayName: displayName?.trim() || normalised.split('@')[0] }
}

export async function signInLocal({ email, password }) {
  const store = getStore()
  const normalised = String(email).trim().toLowerCase()
  const profiles = store.allProfiles ? await store.allProfiles() : []
  const profile = profiles.find((p) => p.email?.toLowerCase() === normalised)

  // Always run a hash comparison so timing does not reveal account existence.
  const stored = profile?.passwordHash ?? DUMMY_HASH
  const ok = verifyPassword(password, stored)
  if (!profile || !ok) {
    const error = new Error('Incorrect email or password.')
    error.code = 'invalid_credentials'
    throw error
  }
  return {
    id: profile.id,
    email: profile.email,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl ?? null,
  }
}

const DUMMY_HASH = hashPassword('hackradar-dummy-password-never-matches')

export async function changePasswordLocal(userId, { currentPassword, newPassword }) {
  const store = getStore()
  const profiles = store.allProfiles ? await store.allProfiles() : []
  const profile = profiles.find((p) => p.id === userId)
  if (!profile?.passwordHash) {
    const error = new Error('Password login is not enabled for this account.')
    error.code = 'no_local_password'
    throw error
  }
  if (!verifyPassword(currentPassword, profile.passwordHash)) {
    const error = new Error('Current password is incorrect.')
    error.code = 'invalid_credentials'
    throw error
  }
  const updated = await store.upsertProfile({
    ...profile,
    passwordHash: hashPassword(newPassword),
  })
  return updated
}

/**
 * Password recovery.
 *
 * Without a configured email provider there is nowhere to send a reset link, so
 * this returns an explicit, honest failure rather than pretending to send mail.
 */
export async function requestPasswordReset(email) {
  const configured = Boolean(config.email.provider)
  return { delivered: false, configured, email }
}

export function setSessionCookie(res, token) {
  res.cookie(config.auth.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: config.auth.sessionTtlDays * 86_400_000,
    path: '/',
  })
}

export function clearSessionCookie(res) {
  res.clearCookie(config.auth.cookieName, { path: '/' })
}

export { hashPassword, verifyPassword }
