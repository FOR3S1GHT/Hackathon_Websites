import { Router } from 'express'
import { z } from 'zod'
import { getStore } from '../db/index.js'
import { toPublicHackathon } from '../pipeline/normalize.js'
import { effectiveStatus, aggregateCounts, buildFacets, searchHackathons } from '../services/search.js'
import { SORT_OPTIONS, STATUS_OPTIONS, FORMAT_OPTIONS, NEWLY_ADDED_WINDOW_DAYS } from '../services/search.js'
import { CATEGORIES, TECHNOLOGIES } from '../../shared/taxonomy.js'
import { describeSources, UNAVAILABLE_SOURCES } from '../sources/index.js'
import { enrichDetails, getSyncStatus } from '../pipeline/sync.js'
import { daysUntil, formatDateRange, now, parseSourceDate } from '../lib/dates.js'
import { HttpError, asyncHandler } from '../lib/routeHelpers.js'

const router = Router()

const listQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.union([z.string(), z.array(z.string())]).optional(),
  registration: z.union([z.string(), z.array(z.string())]).optional(),
  format: z.union([z.string(), z.array(z.string())]).optional(),
  category: z.union([z.string(), z.array(z.string())]).optional(),
  technology: z.union([z.string(), z.array(z.string())]).optional(),
  country: z.union([z.string(), z.array(z.string())]).optional(),
  difficulty: z.union([z.string(), z.array(z.string())]).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  sort: z.enum(SORT_OPTIONS.map((s) => s.value)).optional(),
  page: z.coerce.number().int().min(1).max(500).optional(),
  pageSize: z.coerce.number().int().min(1).max(60).optional(),
  free: z.coerce.boolean().optional(),
  prize: z.coerce.boolean().optional(),
  beginnerFriendly: z.coerce.boolean().optional(),
  featured: z.coerce.boolean().optional(),
})

function coerceQuery(query) {
  const raw = { ...query }
  for (const key of ['free', 'prize', 'beginnerFriendly', 'featured']) {
    if (raw[key] === undefined) continue
    raw[key] = raw[key] === 'true' || raw[key] === true || raw[key] === '1'
  }
  return raw
}

/**
 * Map the public query vocabulary onto the search service's vocabulary.
 *
 * These two sets of names are deliberately different. The query string is a
 * public API contract — `?prize=true&free=true&featured=true` is what the
 * frontend and any bookmarked URL send — while `search.js` names its own
 * conditions after what they select (`prizeOnly`, `freeOnly`, `featuredOnly`).
 *
 * The mapping is written out here rather than left implicit because the
 * alternative is what this code previously did: spread `...params` straight
 * through, which meant `prize`, `free` and `featured` were validated, echoed
 * back in `appliedFilters`, shown as active chips in the UI — and silently did
 * nothing. Three documented filters, three dead toggles. `beginnerFriendly` is
 * the one name that happens to match on both sides, which is exactly why the
 * omission was so easy to miss.
 *
 * The mapped flags stay three-state on purpose. `undefined` (the param was not
 * sent) means no restriction; `true` and `false` are both real selections and
 * `false` selects the inverse — `?prize=false` is "events with no prize pool".
 */
function toSearchParams(params) {
  const {
    free,
    prize,
    featured,
    beginnerFriendly,
    // Zod has already stripped anything not in the schema, so these are the
    // only remaining public-only keys.
    ...rest
  } = params

  return {
    ...rest,
    freeOnly: free,
    prizeOnly: prize,
    featuredOnly: featured,
    beginnerFriendly,
  }
}

/**
 * GET /api/hackathons
 * Search, filter, sort and paginate. All state lives in the query string so any
 * view is shareable as a URL.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const params = listQuerySchema.parse(coerceQuery(req.query))
    const store = getStore()
    const reference = now()

    const result = await store.queryHackathons({
      ...toSearchParams(params),
      now: reference.toISOString(),
      includeFacets: true,
    })

    res.json({
      items: result.items.map((row) =>
        toPublicHackathon(row, {
          derivedStatus: effectiveStatus(row, reference),
          daysToRegistrationDeadline: daysUntil(row.registrationDeadline, reference),
          dateRangeLabel: formatDateRange(row.startDate, row.endDate),
        }),
      ),
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
        hasMore: result.hasMore,
      },
      facets: result.facets ?? buildFacets([]),
      counts: result.globalCounts ?? null,
      appliedFilters: {
        ...params,
        newlyAddedWindowDays: NEWLY_ADDED_WINDOW_DAYS,
      },
    })
  }),
)

/** GET /api/hackathons/meta — filter vocabulary + live counts. */
router.get(
  '/meta',
  asyncHandler(async (req, res) => {
    const store = getStore()
    const reference = now()
    const all = await store.findHackathonCandidates()
    const counts = aggregateCounts(all, reference)

    res.json({
      counts,
      sortOptions: SORT_OPTIONS,
      statusOptions: STATUS_OPTIONS,
      formatOptions: FORMAT_OPTIONS,
      categories: CATEGORIES.map((c) => ({
        key: c.key,
        label: c.label,
        blurb: c.blurb,
        count: counts.categories[c.key] ?? 0,
      })),
      technologies: TECHNOLOGIES.map((t) => ({
        key: t.key,
        label: t.label,
        count: counts.technologies[t.label] ?? 0,
      })).filter((t) => t.count > 0 || counts.technologies[t.label] === undefined),
      countries: Object.entries(counts.countries).map(([name, count]) => ({ name, count })),
      newlyAddedWindowDays: NEWLY_ADDED_WINDOW_DAYS,
    })
  }),
)

/** GET /api/hackathons/featured — homepage hero set. */
router.get(
  '/featured',
  asyncHandler(async (req, res) => {
    const store = getStore()
    const reference = now()
    const all = await store.findHackathonCandidates()

    const rank = (h) => {
      let score = 0
      if (h.featured) score += 40
      if (effectiveStatus(h, reference) === 'ongoing') score += 30
      if (effectiveStatus(h, reference) === 'upcoming') score += 20
      if (h.prizePool > 0) score += 10
      if (h.bannerUrl) score += 6
      if ((h.themes?.length ?? 0) >= 2) score += 4
      if (h.registrationOpen) score += 5
      if (h.participantCount > 500) score += 5
      // Prefer events happening soon so the homepage is always actionable.
      const days = daysUntil(h.startDate, reference)
      if (days !== null && days >= 0 && days <= 30) score += 12
      return score
    }

    const featured = all
      .filter((h) => effectiveStatus(h, reference) !== 'completed')
      .sort((a, b) => rank(b) - rank(a))
      .slice(0, 8)

    res.json({
      items: featured.map((h) =>
        toPublicHackathon(h, {
          derivedStatus: effectiveStatus(h, reference),
          daysToRegistrationDeadline: daysUntil(h.registrationDeadline, reference),
          dateRangeLabel: formatDateRange(h.startDate, h.endDate),
        }),
      ),
      rule:
        'Ranked by: source "featured" flag (+40), currently ongoing (+30), upcoming (+20), registration open (+5), has a prize pool (+10), has a banner image (+6), 2+ published themes (+4), 500+ participants (+5), starting within 30 days (+12). Newly announced events surface here as soon as they are indexed.',
    })
  }),
)

/** GET /api/hackathons/recent — newest discoveries, for the "Recently added" feed. */
router.get(
  '/recent',
  asyncHandler(async (req, res) => {
    const store = getStore()
    const reference = now()
    const limit = Math.min(Number(req.query.limit) || 12, 50)
    const all = await store.findHackathonCandidates()

    const items = all
      .filter((h) => effectiveStatus(h, reference) !== 'completed')
      .sort((a, b) => new Date(b.firstDiscoveredAt ?? 0) - new Date(a.firstDiscoveredAt ?? 0))
      .slice(0, limit)
      .map((h) =>
        toPublicHackathon(h, {
          derivedStatus: effectiveStatus(h, reference),
          daysToRegistrationDeadline: daysUntil(h.registrationDeadline, reference),
          dateRangeLabel: formatDateRange(h.startDate, h.endDate),
        }),
      )

    res.json({
      items,
      explanation:
        'Ordered by the moment HackRadar first stored the event (first_discovered_at) — not by the date the organiser published it, which most sources do not expose.',
    })
  }),
)

/** GET /api/hackathons/:slug — full detail page. */
router.get(
  '/:slug',
  asyncHandler(async (req, res) => {
    const store = getStore()
    const reference = now()
    const { slug } = req.params

    const record =
      (await store.getHackathonBySlug(slug)) ?? (await store.getHackathonById(slug))
    if (!record) {
      throw new HttpError(404, 'not_found', `No hackathon found for "${slug}".`)
    }

    // If the record is thin and its source supports lazy detail, fetch it now.
    // This makes detail pages useful immediately without a full enrichment pass.
    let enriched = false
    if (!record.description) {
      try {
        const result = await enrichDetails(1, { forceId: record.id })
        if (result.count) {
          enriched = true
        }
      } catch {
        /* enrichment is best-effort */
      }
    }
    const fresh = enriched ? ((await store.getHackathonById(record.id)) ?? record) : record

    res.json({
      hackathon: toPublicHackathon(fresh, {
        derivedStatus: effectiveStatus(fresh, reference),
        daysToRegistrationDeadline: daysUntil(fresh.registrationDeadline, reference),
        daysToStart: daysUntil(fresh.startDate, reference),
        dateRangeLabel: formatDateRange(fresh.startDate, fresh.endDate),
        enrichedOnDemand: enriched,
      }),
    })
  }),
)

/** POST /api/hackathons/:id/enrich — force a detail refresh. */
router.post(
  '/:id/enrich',
  asyncHandler(async (req, res) => {
    const result = await enrichDetails(1, { forceId: req.params.id })
    res.json({ ok: true, ...result })
  }),
)

export { searchHackathons, parseSourceDate, describeSources, UNAVAILABLE_SOURCES, getSyncStatus }
export default router
