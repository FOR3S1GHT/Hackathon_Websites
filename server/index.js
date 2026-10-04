import path from 'node:path'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'

import { config, ROOT_DIR } from './config.js'
import { createLogger } from './lib/logger.js'
import { initStore, getStore } from './db/index.js'
import { errorHandler, notFoundHandler, asyncHandler } from './lib/routeHelpers.js'
import { startScheduler, stopScheduler } from './scheduler.js'
import { initPush } from './services/push.js'
import { verifyUnsubscribeSig } from './services/email.js'

import hackathonsRouter from './routes/hackathons.js'
import authRouter from './routes/auth.js'
import userRouter from './routes/user.js'
import notificationsRouter from './routes/notifications.js'
import ideasRouter from './routes/ideas.js'
import streamRouter from './routes/stream.js'
import cronRouter from './routes/cron.js'
import metaRouter, { healthHandler } from './routes/meta.js'

const log = createLogger('server')

export async function createApp() {
  await initStore()

  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)

  app.use(
    helmet({
      // The API only ever returns JSON; the SPA is served with its own headers.
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      // Required for the SSE endpoint and for Supabase Realtime sockets.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  )

  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header = same-origin, curl, or a server-to-server cron call.
        if (!origin) return callback(null, true)
        if (config.corsOrigins.includes('*') || config.corsOrigins.includes(origin)) {
          return callback(null, true)
        }
        return callback(new Error(`Origin ${origin} is not allowed by CORS_ORIGINS.`))
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    }),
  )

  app.use(express.json({ limit: '256kb' }))
  app.use(cookieParser())

  // Liveness probe, registered *before* the rate limiter so that a busy public
  // /api/health can never be the reason a probe fails.
  app.get('/api/health', healthHandler)

  // General abuse protection. Sensitive routes add their own stricter limiter.
  app.use(
    '/api',
    rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.generalMax,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => req.path === '/health',
      message: { error: 'rate_limited', message: 'Too many requests. Please slow down.' },
    }),
  )

  app.use('/api/meta', metaRouter)
  app.use('/api/hackathons', hackathonsRouter)
  app.use('/api/auth', authRouter)
  app.use('/api/notifications', notificationsRouter)
  app.use('/api/ideas', ideasRouter)
  app.use('/api/stream', streamRouter)
  app.use('/api/cron', cronRouter)
  // Mounted at /api (not /api/me) so the router's own `/me` prefix is not doubled.
  app.use('/api', userRouter)

  /** One-click email unsubscribe (RFC 8058 style). */
  app.get(
    '/api/unsubscribe',
    asyncHandler(async (req, res) => {
      const { u: userId, t: type, sig } = req.query
      const valid =
        userId && type && sig && verifyUnsubscribeSig(String(userId), String(type), String(sig), config.auth.jwtSecret)
      if (!valid) {
        return res.status(400).send('This unsubscribe link is invalid or has been tampered with.')
      }
      await getStore().deleteSubscription(String(userId), String(type))
      res.type('html').send(
        `<!doctype html><html><body style="font-family:system-ui;padding:40px;max-width:560px;margin:0 auto">
        <h1 style="text-transform:uppercase;letter-spacing:-1px">Unsubscribed</h1>
        <p>You will no longer receive <strong>${String(type).replace(/[<>&"]/g, '')}</strong> emails from HackRadar.</p>
        <p><a href="/">Back to HackRadar</a></p></body></html>`,
      )
    }),
  )

  app.use('/api', notFoundHandler)

  // ---- Serve the built SPA in production --------------------------------
  const distDir = path.join(ROOT_DIR, 'dist')
  if (fs.existsSync(distDir)) {
    app.use(
      express.static(distDir, {
        index: false,
        setHeaders(res, filePath) {
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
          } else {
            res.setHeader('Cache-Control', 'public, max-age=3600')
          }
        },
      }),
    )
    // SPA fallback — every non-API route resolves to the client router.
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next()
      res.sendFile(path.join(distDir, 'index.html'))
    })
  } else {
    app.get('/', (_req, res) => {
      res.json({
        message:
          'HackRadar API is running. Start the frontend with `npm run dev:web`, or run `npm run build` to have this server serve the SPA from dist/.',
        api: '/api/meta',
      })
    })
  }

  app.use(errorHandler)
  return app
}

export async function startServer({ port = config.port } = {}) {
  const app = await createApp()
  initPush()

  const server = app.listen(port, () => {
    const store = getStore()
    log.info(`HackRadar API listening`, {
      url: `http://localhost:${port}`,
      env: config.env,
      store: store.driver,
      dist: fs.existsSync(path.join(ROOT_DIR, 'dist')) ? 'served' : 'not built',
    })
  })

  // SSE connections must not be killed by the default header timeout.
  server.keepAliveTimeout = 65_000
  server.headersTimeout = 70_000

  if (config.env !== 'test') startScheduler()

  const shutdown = async (signal) => {
    log.info(`${signal} received — shutting down`)
    stopScheduler()
    server.close(() => {
      const store = getStore()
      if (typeof store.flushSync === 'function') store.flushSync()
      process.exit(0)
    })
    // Force exit if sockets (SSE) refuse to drain.
    setTimeout(() => process.exit(0), 6000).unref()
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  return { app, server }
}

// Only auto-start when executed directly, so tests can import createApp().
// pathToFileURL is required: building `file://` by hand leaves Windows
// backslashes in the URL, which never matches import.meta.url.
const isDirectRun =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (isDirectRun) {
  startServer().catch((err) => {
    log.error('Failed to start server', err)
    process.exit(1)
  })
}
