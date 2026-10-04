import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'

import { createApp } from '@server/index.js'
import { getStore } from '@server/db/index.js'
import { makeNormalized } from './helpers/fixtures.js'

/**
 * End-to-end API tests against the real Express app.
 *
 * These run the actual router stack — validation, rate limiting, error handler,
 * JSON serialisation — with the real local datastore in a temp directory. They
 * are the tests that catch "the unit test passed but the endpoint 500s".
 */

let app
let store

const AUTH_EMAIL = 'builder@example.test'
const AUTH_PASSWORD = 'correct-horse-battery'

const iso = (offsetDays) =>
  new Date(Date.now() + offsetDays * 86_400_000).toISOString()

/** Four events, deliberately different in every filterable dimension. */
const SEED = [
  makeNormalized({
    slug: 'smart-india-hackathon',
    title: 'Smart India Hackathon',
    organizer: 'Smart India',
    sourceName: 'devpost',
    sourceUrl: 'https://devpost.com/smart-india-hackathon',
    category: 'artificial-intelligence',
    technologies: ['Python', 'React'],
    themes: ['AI'],
    eventFormat: 'offline',
    location: 'Bengaluru, India',
    country: 'India',
    prizePool: 500000,
    currency: 'INR',
    isFree: true,
    isPaid: false,
    beginnerFriendly: true,
    featured: true,
    startDate: iso(-1),
    endDate: iso(1),
    registrationDeadline: iso(10),
  }),
  makeNormalized({
    slug: 'blockchain-builders-summit',
    title: 'Blockchain Builders Summit',
    organizer: 'Chain Labs',
    sourceName: 'unstop',
    sourceUrl: 'https://unstop.com/blockchain-builders',
    category: 'blockchain-web3',
    technologies: ['Solidity'],
    eventFormat: 'online',
    location: 'Online',
    prizePool: 25000,
    currency: 'USD',
    isPaid: true,
    startDate: iso(20),
    endDate: iso(22),
    registrationDeadline: iso(4),
  }),
  makeNormalized({
    slug: 'climate-sprint-berlin',
    title: 'Global Climate Sprint',
    organizer: 'Green Earth',
    sourceName: 'devfolio',
    sourceUrl: 'https://devfolio.co/climate-sprint',
    category: 'sustainability',
    technologies: ['Python'],
    eventFormat: 'hybrid',
    location: 'Berlin, Germany',
    country: 'Germany',
    startDate: iso(-90),
    endDate: iso(-88),
    firstDiscoveredAt: iso(-200),
  }),
  makeNormalized({
    slug: 'quiet-data-afternoon',
    title: 'Quiet Data Science Afternoon',
    organizer: 'Data Guild',
    sourceName: 'hackerearth',
    sourceUrl: 'https://hackerearth.com/quiet-data',
    category: 'data-science',
    technologies: ['Python', 'SQL'],
    // No venue published: "unknown" is the honest value.
    eventFormat: 'unknown',
    location: null,
    startDate: iso(60),
    endDate: iso(61),
  }),
]

beforeAll(async () => {
  app = await createApp()
  store = getStore()
  await store.upsertHackathons(SEED)
  await store.flush?.()
})

afterAll(async () => {
  await store?.flushSync?.()
})

/** Register (or reuse) a test account and return its bearer token. */
async function signIn(email = AUTH_EMAIL, password = AUTH_PASSWORD) {
  const res = await request(app)
    .post('/api/auth/signup')
    .send({ email, password, displayName: 'Test Builder' })
  if (res.status === 201) return res.body.token
  const login = await request(app).post('/api/auth/login').send({ email, password })
  return login.body.token
}

const auth = (token) => ({ Authorization: `Bearer ${token}` })

describe('GET /api/health', () => {
  it('reports liveness without touching the rate limiter', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('status')
  })
})

describe('GET /api/meta', () => {
  it('reports the catalogue totals the home page renders', async () => {
    const res = await request(app).get('/api/meta')
    expect(res.status).toBe(200)
    expect(res.body.stats.hackathons).toBeGreaterThanOrEqual(SEED.length)
  })

  it('names every configured data source', async () => {
    const res = await request(app).get('/api/meta')
    const names = res.body.sources.map((s) => s.id ?? s.name)
    expect(names).toEqual(expect.arrayContaining(['devpost', 'unstop', 'devfolio', 'hackerearth']))
  })

  it('documents the sources it could not integrate, and why', async () => {
    const res = await request(app).get('/api/meta')
    expect(Array.isArray(res.body.unavailableSources)).toBe(true)
    for (const entry of res.body.unavailableSources) {
      expect(entry.reason, entry.name).toBeTruthy()
    }
  })

  it('discloses sync freshness without claiming realtime', async () => {
    const res = await request(app).get('/api/meta')
    expect(res.body.sync).toHaveProperty('disclosure')
    expect(res.body.sync).toHaveProperty('lastSuccessfulSync')
  })

  it('surfaces a successful sync run through /api/meta', async () => {
    // The regression this guards: `toHaveProperty('lastSuccessfulSync')` passed
    // while the value was permanently null, because success runs were the one
    // case that never wrote a sync_logs row. The Data Sources page therefore
    // showed "Never" after every successful sync, and — because
    // `shouldRunSource` reads the same table — the per-source poll interval
    // throttle never engaged at all.
    await store.createSyncLog({
      sourceName: 'devpost',
      syncStartedAt: iso(-1),
      syncCompletedAt: iso(-1),
      status: 'success',
      eventsDiscovered: 12,
      eventsUpdated: 3,
      durationMs: 420,
      errorMessage: null,
    })

    const res = await request(app).get('/api/meta')
    expect(res.body.sync.lastSuccessfulSync).toBeTruthy()
    expect(res.body.sync.lastSuccessfulSync.sourceName).toBe('devpost')

    const runs = res.body.sync.recentRuns
    expect(Array.isArray(runs)).toBe(true)
    expect(runs.length).toBeGreaterThan(0)
    // The UI renders these fields directly, so each one has to survive the trip.
    const row = runs.find((r) => r.sourceName === 'devpost')
    expect(row.eventsDiscovered).toBe(12)
    expect(row.eventsUpdated).toBe(3)
    expect(row.status).toBe('success')
  })

  it('ignores failed runs when reporting the last successful sync', async () => {
    const before = await request(app).get('/api/meta')
    const successful = before.body.sync.lastSuccessfulSync?.syncCompletedAt

    await store.createSyncLog({
      sourceName: 'devfolio',
      syncStartedAt: iso(0),
      syncCompletedAt: iso(0),
      status: 'failed',
      eventsDiscovered: 0,
      eventsUpdated: 0,
      durationMs: 10,
      errorMessage: 'upstream timeout',
    })

    const after = await request(app).get('/api/meta')
    expect(after.body.sync.lastSuccessfulSync?.syncCompletedAt).toBe(successful)
    // The failure is still recorded and visible.
    expect(after.body.sync.recentRuns.some((r) => r.status === 'failed')).toBe(true)
  })

  it('reports which optional capabilities are actually enabled', async () => {
    const res = await request(app).get('/api/meta')
    expect(res.body.capabilities).toHaveProperty('ai')
    expect(res.body.store).toBeTruthy()
  })

  it('separates "last attempt" from "last refresh" in /api/meta', async () => {
    // The regression this guards: the footer, home, dashboard and About all
    // printed "Catalogue last refreshed <lastSyncAt>". `lastSyncAt` is bumped by
    // every attempt, including one where all four sources were still inside
    // their poll interval — that run finishes in ~0 ms, writes no rows and
    // changes no data, so the site was claiming to be fresher than it was.
    const res = await request(app).get('/api/meta')
    expect(res.body.sync).toHaveProperty('lastRefreshedAt')
    expect(res.body.sync.lastRefreshedAt).toBeTruthy()
    // And it is the completed-at of the newest *successful* run, never an
    // attempt timestamp that could have come from a skipped run.
    expect(res.body.sync.lastRefreshedAt).toBe(
      res.body.sync.lastSuccessfulSync.syncCompletedAt ??
        res.body.sync.lastSuccessfulSync.syncStartedAt,
    )
  })

  it('states the enrichment budget the Data Sources page displays', async () => {
    // The page rendered "0 records per run" while the pipeline was enriching 38
    // records every sync, because it read `capabilities.enrichmentBudget` and
    // the endpoint never sent it.
    const res = await request(app).get('/api/meta')
    expect(typeof res.body.capabilities.enrichmentBudget).toBe('number')
    expect(res.body.capabilities.enrichmentBudget).toBeGreaterThanOrEqual(0)
  })

  it('formats poll intervals as text, not as a stringified object', async () => {
    // The same page rendered the literal "[object Object]" because it
    // interpolated the per-source interval map directly.
    const res = await request(app).get('/api/meta')
    const summary = res.body.sync.perSourceIntervalSummary
    expect(typeof summary).toBe('string')
    expect(summary).not.toContain('[object')
    expect(summary.length).toBeGreaterThan(0)
    for (const token of summary.split('·').map((part) => part.trim())) {
      expect(token, token).toMatch(/^[a-z]+ \d+ (min|hr)$/)
    }
  })

  it('describes the poll window in prose without leaking a config key name', async () => {
    const res = await request(app).get('/api/meta')
    const disclosure = res.body.sync.disclosure
    expect(typeof disclosure).toBe('string')
    // "see perSourceIntervalMinutes" told a reader nothing about real staleness.
    expect(disclosure).not.toMatch(/perSourceIntervalMinutes|SYNC_/)
    expect(disclosure).toMatch(/every \d+ (min|hr)/)
    // The honesty claim the page exists to make must survive.
    expect(disclosure).toMatch(/not instant/i)
  })

  it('never leaks a secret to the browser', async () => {
    const res = await request(app).get('/api/meta')
    const serialised = JSON.stringify(res.body)
    expect(serialised).not.toContain(process.env.JWT_SECRET)
    expect(serialised).not.toMatch(/service_role|SUPABASE_SERVICE_ROLE/i)
  })
})

describe('GET /api/hackathons', () => {
  it('returns items, pagination, facets and counts', async () => {
    const res = await request(app).get('/api/hackathons')
    expect(res.status).toBe(200)
    for (const key of ['items', 'pagination', 'facets', 'counts']) {
      expect(res.body, key).toHaveProperty(key)
    }
    expect(res.body.items.length).toBeGreaterThan(0)
  })

  it('echoes the filters it actually applied', async () => {
    const res = await request(app).get('/api/hackathons?status=upcoming&format=online')
    expect(res.body.appliedFilters).toMatchObject({ status: 'upcoming', format: 'online' })
  })

  it('filters by free-text query', async () => {
    const res = await request(app).get('/api/hackathons?q=blockchain')
    expect(res.body.items.map((h) => h.title)).toEqual(['Blockchain Builders Summit'])
  })

  it('filters by status, category and technology', async () => {
    const byCategory = await request(app).get('/api/hackathons?category=robotics')
    expect(byCategory.body.items).toHaveLength(0)

    const byTech = await request(app).get('/api/hackathons?technology=Solidity')
    expect(byTech.body.items).toHaveLength(1)
  })

  it('treats a comma-separated filter as OR', async () => {
    const res = await request(app).get('/api/hackathons?status=upcoming,ongoing')
    expect(res.body.items.length).toBeGreaterThan(1)
  })

  it('sorts and paginates', async () => {
    const res = await request(app).get('/api/hackathons?sort=start-date&pageSize=2&page=1')
    expect(res.body.items).toHaveLength(2)
    expect(res.body.pagination.page).toBe(1)
    expect(res.body.pagination.pageSize).toBe(2)
    expect(res.body.pagination.total).toBeGreaterThanOrEqual(SEED.length)
  })

  it('rejects an out-of-range page instead of silently clamping', async () => {
    const res = await request(app).get('/api/hackathons?page=0')
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('rejects an unknown sort value rather than guessing', async () => {
    const res = await request(app).get('/api/hackathons?sort=cheapest')
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('never leaks internal ranking fields in a list response', async () => {
    const res = await request(app).get('/api/hackathons?q=python')
    for (const item of res.body.items) {
      expect(item).not.toHaveProperty('__score')
    }
  })

  it('reports catalogue-wide counts, not just the current page', async () => {
    const res = await request(app).get('/api/hackathons?pageSize=1')
    expect(res.body.counts.total).toBeGreaterThanOrEqual(SEED.length)
  })

  describe('the boolean filters actually filter', () => {
    // The regression these guard: `?prize=true`, `?free=true` and
    // `?featured=true` were validated, echoed back in `appliedFilters`, rendered
    // as active filter chips in the UI — and did nothing, because the route
    // spread the public query names straight into a search service that reads
    // `prizeOnly` / `freeOnly` / `featuredOnly`. `beginnerFriendly` worked only
    // because it is spelled identically on both sides.

    const slugs = (res) => res.body.items.map((h) => h.slug)

    it('?prize=true keeps only events with a published prize pool', async () => {
      const res = await request(app).get('/api/hackathons?prize=true&pageSize=50')
      expect(res.body.pagination.total).toBeGreaterThan(0)
      expect(res.body.pagination.total).toBeLessThan(res.body.counts.total)
      for (const item of res.body.items) expect(item.prizePool).toBeGreaterThan(0)
      expect(slugs(res)).toContain('smart-india-hackathon')
      expect(slugs(res)).not.toContain('quiet-data-afternoon')
    })

    it('?free=true keeps only events whose source stated they cost nothing', async () => {
      const res = await request(app).get('/api/hackathons?free=true&pageSize=50')
      expect(slugs(res)).toContain('smart-india-hackathon')
      expect(slugs(res)).not.toContain('blockchain-builders-summit')
    })

    it('?free=true drops events whose fee was never published', async () => {
      // "We do not know the fee" is not "it is free". Two of the four fixtures
      // publish no fee at all, and the real catalogue is mostly like that, so a
      // free filter that kept them would be reporting a payment status the
      // source never gave — while the card renders "Fee: not stated".
      const res = await request(app).get('/api/hackathons?free=true&pageSize=50')
      expect(slugs(res)).not.toContain('quiet-data-afternoon')
      for (const item of res.body.items) expect(item.isFree).toBe(true)
    })

    it('?free=false is the inverse, not a no-op', async () => {
      const res = await request(app).get('/api/hackathons?free=false&pageSize=50')
      const unfiltered = await request(app).get('/api/hackathons?pageSize=50')
      expect(res.body.pagination.total).toBeLessThan(unfiltered.body.pagination.total)
      expect(slugs(res)).not.toContain('smart-india-hackathon')
      expect(slugs(res)).toContain('quiet-data-afternoon')
    })

    it('?featured=true keeps only featured events', async () => {
      const res = await request(app).get('/api/hackathons?featured=true&pageSize=50')
      expect(slugs(res)).toEqual(['smart-india-hackathon'])
    })

    it('?beginnerFriendly=true still works, since the names match', async () => {
      const res = await request(app).get('/api/hackathons?beginnerFriendly=true&pageSize=50')
      expect(slugs(res)).toContain('smart-india-hackathon')
      expect(slugs(res)).not.toContain('blockchain-builders-summit')
    })

    it('combines a boolean filter with a text query rather than replacing it', async () => {
      // The failure mode a wrong key produces is usually "returns everything",
      // so an assertion that it returns *something* is not enough — the result
      // has to be a strict subset satisfying both conditions.
      const all = await request(app).get('/api/hackathons?pageSize=50')
      const res = await request(app).get('/api/hackathons?prize=true&q=india&pageSize=50')
      expect(res.body.pagination.total).toBeLessThan(all.body.pagination.total)
      for (const item of res.body.items) {
        expect(item.prizePool).toBeGreaterThan(0)
        expect(`${item.title} ${item.organizer} ${item.location}`.toLowerCase()).toContain('india')
      }
    })

    it('treats an absent boolean as "no constraint", not as a filter', async () => {
      // `prize=false` is a real selection (see above); only *omitting* the
      // param means unrestricted, which is what a shared URL without the chip
      // has to do.
      const unfiltered = await request(app).get('/api/hackathons?pageSize=50')
      const res = await request(app).get('/api/hackathons?pageSize=50')
      expect(res.body.pagination.total).toBe(unfiltered.body.pagination.total)
      expect(res.body.appliedFilters.prizeOnly).toBeUndefined()
    })

    it('?prize=false selects events with no published prize pool', async () => {
      const res = await request(app).get('/api/hackathons?prize=false&pageSize=50')
      const all = await request(app).get('/api/hackathons?pageSize=50')
      expect(res.body.pagination.total).toBeLessThan(all.body.pagination.total)
      for (const item of res.body.items) expect(item.prizePool ?? 0).toBe(0)
    })
  })
})

describe('GET /api/hackathons/:slug', () => {
  it('returns one hackathon with its provenance', async () => {
    const res = await request(app).get('/api/hackathons/smart-india-hackathon')
    expect(res.status).toBe(200)
    expect(res.body.hackathon.title).toBe('Smart India Hackathon')
    expect(res.body.hackathon.sourceName).toBe('devpost')
    expect(res.body.hackathon.sourceUrl).toContain('devpost.com')
  })

  it('computes the live lifecycle status rather than echoing a stale column', async () => {
    const res = await request(app).get('/api/hackathons/smart-india-hackathon')
    expect(['upcoming', 'ongoing', 'completed']).toContain(res.body.hackathon.derivedStatus)
  })

  it('separates discovery time from organiser publish time', async () => {
    const res = await request(app).get('/api/hackathons/smart-india-hackathon')
    const hackathon = res.body.hackathon
    expect(hackathon).toHaveProperty('firstDiscoveredAt')
    expect(hackathon).toHaveProperty('sourcePublishedAt')
    expect(hackathon).toHaveProperty('updatedAt')
  })

  it('returns 404 for an unknown slug, not a 200 with an empty object', async () => {
    const res = await request(app).get('/api/hackathons/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.body.error).toBeTruthy()
  })

  it('returns 404 for a slug-shaped path that is really a nested route', async () => {
    // `/featured` and `/recent` are real endpoints; anything else is a 404.
    const res = await request(app).get('/api/hackathons/recent-not-a-route')
    expect(res.status).toBe(404)
  })

  it('lists recently discovered events with an explanation of the ordering', async () => {
    const res = await request(app).get('/api/hackathons/recent')
    expect(res.status).toBe(200)
    expect(res.body.explanation).toMatch(/first_discovered_at|first stored/i)
  })

  it('lists featured events', async () => {
    const res = await request(app).get('/api/hackathons/featured')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.items)).toBe(true)
  })
})

describe('project ideas endpoints', () => {
  it('generates rule-based ideas for a real hackathon', async () => {
    const res = await request(app)
      .post('/api/ideas/generate')
      .send({ hackathonId: 'smart-india-hackathon', count: 3, engine: 'rules' })
    expect(res.status).toBe(200)
    expect(res.body.ideas).toHaveLength(3)
    expect(res.body.source).toBe('rule-based')
    expect(res.body.ideas.every((i) => i.source === 'rule-based')).toBe(true)
  })

  it('ships a disclaimer on every generated set', async () => {
    const res = await request(app)
      .post('/api/ideas/generate')
      .send({ hackathonId: 'smart-india-hackathon', engine: 'rules' })
    expect(res.body.disclaimer).toMatch(/not official/i)
    expect(res.body.disclaimer).toMatch(/do not guarantee/i)
  })

  it('reports its aiStatus so the UI can say which engine actually ran', async () => {
    const res = await request(app)
      .post('/api/ideas/generate')
      .send({ hackathonId: 'smart-india-hackathon', engine: 'rules' })
    expect(res.body.aiStatus).toHaveProperty('enabled')
  })

  it('never returns two ideas with the same title', async () => {
    const res = await request(app)
      .post('/api/ideas/generate')
      .send({ hackathonId: 'smart-india-hackathon', count: 6, engine: 'rules' })
    const titles = res.body.ideas.map((i) => i.title.toLowerCase())
    expect(new Set(titles).size).toBe(titles.length)
  })

  it('returns 404 for an unknown hackathon', async () => {
    const res = await request(app)
      .post('/api/ideas/generate')
      .send({ hackathonId: 'nope', engine: 'rules' })
    expect(res.status).toBe(404)
  })

  it('rejects an out-of-range count instead of generating hundreds', async () => {
    const res = await request(app)
      .post('/api/ideas/generate')
      .send({ hackathonId: 'smart-india-hackathon', count: 999 })
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('rejects an unknown difficulty filter', async () => {
    const res = await request(app)
      .post('/api/ideas/generate')
      .send({ hackathonId: 'smart-india-hackathon', difficulty: 'wizard' })
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('serves lightweight suggestions without authentication', async () => {
    const res = await request(app).get('/api/ideas/smart-india-hackathon/suggestions')
    expect(res.status).toBe(200)
    expect(res.body.ideas.length).toBeGreaterThan(0)
  })

  it('renders an idea as copyable plain text', async () => {
    const res = await request(app).post('/api/ideas/format').send({
      idea: {
        title: 'AI Triage Copilot',
        problem: 'Reviewers drown in repetitive first-pass work.',
        targetUsers: 'Operations leads',
        difficulty: 'intermediate',
        estimatedTime: '48–72 hours',
        technologies: ['Python'],
        keyFeatures: ['Ranked recommendation'],
        implementationSteps: ['Collect a labelled sample'],
        demoTips: ['Show the correction loop'],
        source: 'rule-based',
      },
      hackathonTitle: 'Smart India Hackathon',
    })
    expect(res.status).toBe(200)
    expect(res.body.text).toContain('AI Triage Copilot')
    expect(res.body.text).toContain('not a guarantee')
  })

  it('reports push/AI capabilities honestly', async () => {
    const res = await request(app).get('/api/ideas/capabilities')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('enabled')
  })
})

describe('authentication', () => {
  it('reports which auth mode is active', async () => {
    const res = await request(app).get('/api/auth/mode')
    expect(res.status).toBe(200)
    expect(['local', 'supabase']).toContain(res.body.mode)
  })

  it('lets anyone browse the catalogue without an account', async () => {
    const res = await request(app).get('/api/hackathons')
    expect(res.status).toBe(200)
  })

  it('returns a null user, not an error, when nobody is signed in', async () => {
    const res = await request(app).get('/api/auth/me')
    expect(res.status).toBe(200)
    expect(res.body.user).toBeNull()
  })

  it('signs up, signs in and reads the profile', async () => {
    const token = await signIn()
    const me = await request(app).get('/api/auth/me').set(auth(token))
    expect(me.status).toBe(200)
    expect(me.body.user.email).toBe(AUTH_EMAIL)
  })

  it('never returns the password or its hash', async () => {
    const token = await signIn()
    const me = await request(app).get('/api/auth/me').set(auth(token))
    const serialised = JSON.stringify(me.body)
    expect(serialised).not.toContain(AUTH_PASSWORD)
    expect(me.body.user).not.toHaveProperty('passwordHash')
  })

  it('rejects a wrong password with 401 and no hint about which part was wrong', async () => {
    await signIn()
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: AUTH_EMAIL, password: 'wrong-password-here' })
    expect(res.status).toBe(401)
    expect(JSON.stringify(res.body).toLowerCase()).not.toMatch(/no such user|unknown email/)
  })

  it('rejects a short password with a field-level message', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'short@example.test', password: 'abc' })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(JSON.stringify(res.body)).toMatch(/8 characters/i)
  })

  it('rejects a malformed email', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'not-an-email', password: AUTH_PASSWORD })
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('refuses a request with a forged token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set({ Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.e30.invalidsignature' })
    expect(res.body.user).toBeNull()
  })
})

describe('bookmarks', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/me/bookmarks')
    expect(res.status).toBe(401)
  })

  it('adds, lists and removes a bookmark', async () => {
    const token = await signIn()
    const list = await request(app).get('/api/hackathons?pageSize=1').then((r) => r.body.items)
    const id = list[0].id

    const added = await request(app)
      .post(`/api/me/bookmarks/${id}`)
      .set(auth(token))
      .send({})
    expect([200, 201]).toContain(added.status)

    const bookmarks = await request(app).get('/api/me/bookmarks').set(auth(token))
    expect(bookmarks.status).toBe(200)
    expect(bookmarks.body.items.some((b) => b.id === id)).toBe(true)

    const removed = await request(app)
      .delete(`/api/me/bookmarks/${id}`)
      .set(auth(token))
    expect(removed.status).toBe(200)

    const after = await request(app).get('/api/me/bookmarks').set(auth(token))
    expect(after.body.items.some((b) => b.id === id)).toBe(false)
  })

  it('is idempotent — bookmarking twice does not duplicate', async () => {
    const token = await signIn()
    const id = (await request(app).get('/api/hackathons?pageSize=1')).body.items[0].id
    await request(app).post(`/api/me/bookmarks/${id}`).set(auth(token)).send({})
    await request(app).post(`/api/me/bookmarks/${id}`).set(auth(token)).send({})
    const bookmarks = await request(app).get('/api/me/bookmarks').set(auth(token))
    expect(bookmarks.body.items.filter((b) => b.id === id)).toHaveLength(1)
  })

  it('keeps one account out of another account’s bookmarks', async () => {
    const alice = await signIn('alice@example.test', AUTH_PASSWORD)
    const bob = await signIn('bob@example.test', AUTH_PASSWORD)
    const id = (await request(app).get('/api/hackathons?pageSize=1')).body.items[0].id

    await request(app).post(`/api/me/bookmarks/${id}`).set(auth(alice)).send({})
    const bobs = await request(app).get('/api/me/bookmarks').set(auth(bob))
    expect(bobs.body.items.some((b) => b.id === id)).toBe(false)
  })

  it('rejects a bookmark for a hackathon that does not exist', async () => {
    const token = await signIn()
    const res = await request(app)
      .post('/api/me/bookmarks/00000000-0000-0000-0000-000000000000')
      .set(auth(token))
      .send({})
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('summarises the dashboard for the signed-in user', async () => {
    const token = await signIn()
    const res = await request(app).get('/api/me/dashboard').set(auth(token))
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('stats')
  })
})

describe('saved project ideas', () => {
  it('saves, lists and deletes an idea', async () => {
    const token = await signIn()
    const created = await request(app)
      .post('/api/me/ideas')
      .set(auth(token))
      .send({
        title: 'Climate Ledger',
        hackathonId: (await request(app).get('/api/hackathons?pageSize=1')).body.items[0].id,
        problem: 'Emissions are estimated once a year.',
        difficulty: 'intermediate',
        technologies: ['Python'],
      })
    expect([200, 201]).toContain(created.status)

    const list = await request(app).get('/api/me/ideas').set(auth(token))
    expect(list.body.items.some((i) => i.title === 'Climate Ledger')).toBe(true)

    const removed = await request(app)
      .delete(`/api/me/ideas/${created.body.idea.id}`)
      .set(auth(token))
    expect(removed.status).toBe(200)
  })
})

describe('notifications', () => {
  it('requires authentication to read the centre', async () => {
    const res = await request(app).get('/api/notifications')
    expect(res.status).toBe(401)
  })

  it('returns an empty centre for a new account rather than an error', async () => {
    const token = await signIn('fresh@example.test', AUTH_PASSWORD)
    const res = await request(app).get('/api/notifications').set(auth(token))
    expect(res.status).toBe(200)
    expect(res.body.items).toEqual([])
    expect(res.body.unreadCount).toBe(0)
  })

  it('reports a zero unread count', async () => {
    const token = await signIn('fresh@example.test', AUTH_PASSWORD)
    const res = await request(app).get('/api/notifications/unread-count').set(auth(token))
    expect(res.status).toBe(200)
    expect(res.body.unreadCount).toBe(0)
  })

  it('reads the push configuration and explains when it is unavailable', async () => {
    const res = await request(app).get('/api/notifications/push/key')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('enabled')
    if (!res.body.enabled) expect(res.body.explanation).toBeTruthy()
  })

  it('reads notification preferences', async () => {
    const token = await signIn('fresh@example.test', AUTH_PASSWORD)
    const res = await request(app).get('/api/notifications/preferences').set(auth(token))
    expect(res.status).toBe(200)
  })
})

describe('error handling and hardening', () => {
  it('returns a structured 404 for an unknown API route', async () => {
    const res = await request(app).get('/api/not-a-real-endpoint')
    expect(res.status).toBe(404)
    expect(res.body.error).toBeTruthy()
  })

  it('never leaks a stack trace or internal path in an error body', async () => {
    const res = await request(app).post('/api/ideas/generate').send({ hackathonId: 123 })
    expect(res.status).toBeGreaterThanOrEqual(400)
    const serialised = JSON.stringify(res.body)
    expect(serialised).not.toMatch(/node_modules/)
    expect(serialised).not.toMatch(/\bat\s+\w+\s+\(/)
    expect(res.body).not.toHaveProperty('stack')
  })

  it('rejects a malformed JSON body instead of crashing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":')
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
  })

  it('sets the standard security headers', async () => {
    const res = await request(app).get('/api/meta')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-powered-by']).toBeUndefined()
  })

  it('does not advertise the server implementation', async () => {
    const res = await request(app).get('/api/meta')
    expect(JSON.stringify(res.headers)).not.toMatch(/express/i)
  })

  it('rejects a cross-origin request from an unlisted origin', async () => {
    const res = await request(app)
      .get('/api/meta')
      .set('Origin', 'https://evil.example')
    // cors() rejects the origin, which express turns into a 500 by default.
    // What matters is that the response is never a usable 200 with data.
    expect(res.status).not.toBe(200)
  })
})
