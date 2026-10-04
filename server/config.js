import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT_DIR = path.resolve(__dirname, '..')

/** Minimal .env loader — avoids a dotenv dependency. Never overrides real env vars. */
function loadEnvFile(file) {
  try {
    if (!fs.existsSync(file)) return
    const raw = fs.readFileSync(file, 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      if (key in process.env) continue
      let value = trimmed.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      process.env[key] = value
    }
  } catch (err) {
    console.warn(`[config] Could not read ${file}: ${err.message}`)
  }
}

loadEnvFile(path.join(ROOT_DIR, '.env'))
loadEnvFile(path.join(ROOT_DIR, '.env.local'))

const bool = (value, fallback = false) => {
  if (value === undefined || value === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())
}

const int = (value, fallback) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.cwd(), process.env.DATA_DIR)
  : path.join(ROOT_DIR, 'data')

fs.mkdirSync(DATA_DIR, { recursive: true })

export const config = {
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: int(process.env.PORT, 8787),
  rootDir: ROOT_DIR,
  dataDir: DATA_DIR,

  /** Comma separated list. `*` allows any origin (dev convenience only). */
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  /** Which datastore driver to use: "auto" | "supabase" | "local". */
  store: (process.env.STORE_DRIVER || 'auto').toLowerCase(),

  supabase: {
    url: process.env.SUPABASE_URL || '',
    /** Service-role key — server only. Never exposed to the browser bundle. */
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    anonKey: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
  },

  auth: {
    /** Secret for signing local-mode session tokens. */
    jwtSecret: process.env.JWT_SECRET || '',
    cookieName: 'hackradar_session',
    sessionTtlDays: int(process.env.SESSION_TTL_DAYS, 30),
  },

  sync: {
    /** Cron expression for the in-process scheduler. */
    cron: process.env.SYNC_CRON || '*/30 * * * *',
    runOnBoot: bool(process.env.SYNC_RUN_ON_BOOT, true),
    /** Shared secret protecting GET/POST /api/cron/sync for external schedulers. */
    cronSecret: process.env.CRON_SECRET || '',
    perSourceIntervalMinutes: {
      devpost: int(process.env.SYNC_INTERVAL_DEVPOST, 45),
      unstop: int(process.env.SYNC_INTERVAL_UNSTOP, 90),
      devfolio: int(process.env.SYNC_INTERVAL_DEVFOLIO, 240),
      hackerearth: int(process.env.SYNC_INTERVAL_HACKEREARTH, 180),
      kaggle: int(process.env.SYNC_INTERVAL_KAGGLE, 720),
    },
    /** Max pages fetched per source in a single run (safety valve). */
    maxPages: {
      devpost: int(process.env.SYNC_MAX_PAGES_DEVPOST, 8),
      unstop: int(process.env.SYNC_MAX_PAGES_UNSTOP, 12),
      devfolio: int(process.env.SYNC_MAX_PAGES_DEVFOLIO, 3),
      hackerearth: int(process.env.SYNC_MAX_PAGES_HACKEREARTH, 2),
      kaggle: int(process.env.SYNC_MAX_PAGES_KAGGLE, 1),
    },
    /** How many details to enrich per run for events still missing detail text. */
    enrichmentBudget: int(process.env.SYNC_ENRICHMENT_BUDGET, 40),
    requestTimeoutMs: int(process.env.SOURCE_TIMEOUT_MS, 25000),
    userAgent:
      process.env.SOURCE_USER_AGENT ||
      'HackRadarBot/1.0 (+https://hackradar.local; open-source hackathon aggregator; respects robots.txt)',
  },

  ai: {
    provider: (process.env.AI_PROVIDER || '').toLowerCase(), // '', 'openai', 'ollama'
    apiKey: process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '',
    baseUrl: process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.AI_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
    /** Set to true only if you have verified the endpoint returns the OpenAI shape. */
    enabled: bool(process.env.AI_ENABLED, false),
    timeoutMs: int(process.env.AI_TIMEOUT_MS, 45000),
    maxIdeas: int(process.env.AI_MAX_IDEAS, 6),
  },

  push: {
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || '',
    subject: process.env.VAPID_SUBJECT || 'mailto:hello@hackradar.local',
  },

  email: {
    /** "smtp" or "resend". Empty means email delivery is disabled. */
    provider: (process.env.EMAIL_PROVIDER || '').toLowerCase(),
    from: process.env.EMAIL_FROM || 'HackRadar <no-reply@hackradar.local>',
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: int(process.env.SMTP_PORT, 587),
      secure: bool(process.env.SMTP_SECURE, false),
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
    resendApiKey: process.env.RESEND_API_KEY || '',
  },

  notifications: {
    /** Hard cap so a large discovery run cannot spam every subscriber. */
    maxPerUserPerRun: int(process.env.NOTIFY_MAX_PER_USER_RUN, 12),
    closingSoonDays: int(process.env.NOTIFY_CLOSING_SOON_DAYS, 5),
    quietHoursDefault: {
      start: int(process.env.QUIET_HOURS_START, 22),
      end: int(process.env.QUIET_HOURS_END, 8),
    },
  },

  rateLimit: {
    windowMs: int(process.env.RATE_LIMIT_WINDOW_MS, 60000),
    generalMax: int(process.env.RATE_LIMIT_GENERAL, 600),
    authMax: int(process.env.RATE_LIMIT_AUTH, 20),
    writeMax: int(process.env.RATE_LIMIT_WRITE, 120),
    aiMax: int(process.env.RATE_LIMIT_AI, 12),
  },
}

/**
 * Whether a signed session token can be minted. In Supabase mode the backend
 * verifies Supabase-issued JWTs instead, so this is only required for the
 * built-in local auth fallback.
 */
export function hasLocalAuthSecret() {
  return Boolean(config.auth.jwtSecret)
}

if (!hasLocalAuthSecret() && config.store !== 'supabase') {
  console.warn(
    '[config] JWT_SECRET is not set. A random development secret will be generated.\n' +
      '         Sessions will be invalidated on restart. Set JWT_SECRET in .env for persistence.',
  )
  config.auth.jwtSecret = crypto.randomBytes(32).toString('hex')
}

/** Safe subset of config that can be returned to the browser. */
export function publicConfig() {
  return {
    store: config.store,
    supabase: config.supabase.url ? { url: config.supabase.url, anonKey: config.supabase.anonKey } : null,
    aiEnabled: config.ai.enabled && Boolean(config.ai.apiKey || config.ai.provider === 'ollama'),
    pushEnabled: Boolean(config.push.publicKey && config.push.privateKey),
    emailEnabled: Boolean(config.email.provider && (config.email.resendApiKey || config.email.smtp.host)),
    authMode: config.supabase.url && config.supabase.anonKey ? 'supabase' : 'local',
    syncCron: config.sync.cron,
  }
}
