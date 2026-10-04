import { config } from '../config.js'
import { createLogger } from './logger.js'

const log = createLogger('http')

/**
 * Per-host token bucket. Each upstream data source gets its own bucket so a
 * slow source can never starve the others, and the concurrency cap keeps us a
 * well-behaved client on every host.
 */
class HostLimiter {
  constructor({ minIntervalMs = 0, concurrency = 2 }) {
    this.minIntervalMs = minIntervalMs
    this.concurrency = concurrency
    this.active = 0
    this.queue = []
    this.lastStartedAt = 0
  }

  acquire() {
    if (this.active >= this.concurrency) {
      return new Promise((resolve) => this.queue.push(resolve))
    }
    return this.#start()
  }

  async #start() {
    this.active += 1
    const wait = this.lastStartedAt + this.minIntervalMs - Date.now()
    if (wait > 0) await sleep(wait)
    this.lastStartedAt = Date.now()
    return () => {
      this.active -= 1
      const next = this.queue.shift()
      if (next) next()
    }
  }
}

const limiters = new Map()

function limiterFor(host) {
  if (!limiters.has(host)) {
    limiters.set(host, new HostLimiter({ minIntervalMs: 350, concurrency: 2 }))
  }
  return limiters.get(host)
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class HttpError extends Error {
  constructor(message, { status, url, body } = {}) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.url = url
    this.body = body
  }
}

export function isRetryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 599)
}

/**
 * Fetch with timeout, per-host rate limiting, and exponential backoff + jitter
 * on transient failures. Retries only happen for network errors, 408/425/429
 * and 5xx — never for 4xx client errors, which would just waste the source's
 * quota.
 */
export async function fetchWithRetry(url, options = {}) {
  const {
    retries = 3,
    timeoutMs = config.sync.requestTimeoutMs,
    headers = {},
    backoffBaseMs = 600,
    maxBackoffMs = 15000,
    ...rest
  } = options

  let host = ''
  try {
    host = new URL(url).host
  } catch {
    throw new HttpError(`Invalid URL: ${url}`, { url })
  }
  const limiter = limiterFor(host)

  let lastError
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const release = await limiter.acquire()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
        ...rest,
        signal: rest.signal ?? controller.signal,
        redirect: rest.redirect ?? 'follow',
        headers: {
          'user-agent': config.sync.userAgent,
          accept: 'application/json, text/html;q=0.9, */*;q=0.8',
          'accept-language': 'en-US,en;q=0.9',
          ...headers,
        },
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        const error = new HttpError(`${res.status} ${res.statusText} for ${url}`, {
          status: res.status,
          url,
          body: body.slice(0, 500),
        })
        if (attempt < retries && isRetryableStatus(res.status)) {
          lastError = error
          await sleep(backoffDelay(attempt, backoffBaseMs, maxBackoffMs))
          continue
        }
        throw error
      }

      return res
    } catch (err) {
      const aborted = err?.name === 'AbortError'
      const networkError = err instanceof TypeError
      const wrapped = aborted
        ? new HttpError(`Timeout after ${timeoutMs}ms for ${url}`, { url })
        : err

      if (attempt < retries && (aborted || networkError || isRetryableStatus(err?.status))) {
        lastError = wrapped
        await sleep(backoffDelay(attempt, backoffBaseMs, maxBackoffMs))
        continue
      }
      throw wrapped
    } finally {
      clearTimeout(timer)
      release()
    }
  }
  throw lastError ?? new HttpError(`Failed to fetch ${url}`, { url })
}

function backoffDelay(attempt, base, max) {
  const exponential = Math.min(base * 2 ** attempt, max)
  return Math.round(exponential * (0.6 + Math.random() * 0.8))
}

export async function fetchJson(url, options = {}) {
  const res = await fetchWithRetry(url, {
    ...options,
    headers: { accept: 'application/json', ...(options.headers || {}) },
  })
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new HttpError(`Response from ${url} was not valid JSON`, {
      url,
      body: text.slice(0, 300),
    })
  }
}

export async function fetchText(url, options = {}) {
  const res = await fetchWithRetry(url, options)
  return res.text()
}

/**
 * Run tasks with bounded concurrency.
 *
 * Returns the raw values in input order; a task that throws yields `undefined`
 * (the error is logged, never rethrown) so one bad item cannot abort a batch.
 */
export async function mapLimit(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      try {
        results[index] = await worker(items[index], index)
      } catch (error) {
        results[index] = undefined
        log.warn(`Task ${index} of ${items.length} failed`, error?.message)
      }
    }
  })
  await Promise.all(runners)
  return results
}
