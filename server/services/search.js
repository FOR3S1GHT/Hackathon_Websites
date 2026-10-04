/**
 * Search / filter / sort engine.
 *
 * These are pure functions over an in-memory array so that:
 *   - the local store can filter without SQL,
 *   - the Supabase store can build an equivalent PostgREST query, and
 *   - the behaviour is unit-testable without a database.
 *
 * Semantics deliberately match between both drivers (see supabaseStore.js).
 */
import { daysUntil, now } from '../lib/dates.js'
import { tokenSet, jaccard } from '../lib/text.js'
import { CATEGORY_KEYS } from '../../shared/taxonomy.js'

export const SORT_OPTIONS = [
  { value: 'recently-discovered', label: 'Recently discovered' },
  { value: 'registration-deadline', label: 'Registration deadline' },
  { value: 'start-date', label: 'Start date' },
  { value: 'prize-pool', label: 'Prize pool' },
  { value: 'alphabetical', label: 'Alphabetical (A–Z)' },
  { value: 'relevance', label: 'Best match' },
]

export const STATUS_OPTIONS = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'ongoing', label: 'Ongoing now' },
  { value: 'completed', label: 'Completed' },
  { value: 'newly-added', label: 'Newly added' },
]

export const FORMAT_OPTIONS = [
  { value: 'online', label: 'Online' },
  { value: 'offline', label: 'In person' },
  { value: 'hybrid', label: 'Hybrid' },
]

const asArray = (value) => {
  if (value === undefined || value === null || value === '') return []
  return (Array.isArray(value) ? value : String(value).split(','))
    .map((v) => String(v).trim().toLowerCase())
    .filter(Boolean)
}

const NEWLY_ADDED_WINDOW_DAYS = 30

/**
 * Build a matcher for one search term.
 *
 * Matching is anchored at a word start and allows any continuation, so
 * "mach" finds "machine learning" and "node" finds "Node.js". Raw substring
 * matching is deliberately avoided: it made "ai" match "blockchain", "ar"
 * match "start" and "ml" match "html", which turns a two-character query into
 * a near-useless result set.
 */
function termMatcher(term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?<![a-z0-9])${escaped}`, 'i')
}

/** Every field free-text search runs against. */
function searchHaystack(hackathon) {
  return [
    hackathon.title,
    hackathon.organizer,
    hackathon.summary,
    hackathon.location,
    hackathon.country,
    hackathon.category,
    hackathon.sourceName,
    ...(hackathon.technologies ?? []),
    ...(hackathon.themes ?? []),
  ]
    .filter(Boolean)
    .join(' ')
}

/** Which of `terms` appear in `haystack`. */
function countTermHits(terms, haystack) {
  let hits = 0
  for (const term of terms) if (termMatcher(term).test(haystack)) hits += 1
  return hits
}

/** Text relevance: title matches beat organizer/technology matches. */
export function scoreMatch(hackathon, query) {
  const terms = tokenSet(query)
  if (!terms.size) return 1

  const title = hackathon.title || ''
  const titleScore = jaccard(terms, tokenSet(title))

  const haystack = searchHaystack(hackathon).toLowerCase()
  const phraseBoost = title.toLowerCase().includes(query.trim().toLowerCase()) ? 3 : 0
  const fieldScore = terms.size ? countTermHits(terms, haystack) / terms.size : 0

  return titleScore * 4 + fieldScore * 1.5 + phraseBoost
}

function matchesText(hackathon, query) {
  const q = query.trim()
  if (!q) return true
  const haystack = searchHaystack(hackathon)

  // Every whitespace-separated term must appear somewhere (AND semantics).
  return q.split(/\s+/).every((term) => termMatcher(term).test(haystack))
}

function statusOf(hackathon, reference) {
  if (hackathon.status === 'cancelled') return 'cancelled'
  const start = hackathon.startDate ? new Date(hackathon.startDate) : null
  const end = hackathon.endDate ? new Date(hackathon.endDate) : null
  if (start && end) {
    if (reference >= start && reference <= end) return 'ongoing'
    if (reference < start) return 'upcoming'
    return 'completed'
  }
  if (start) return reference < start ? 'upcoming' : 'ongoing'
  return hackathon.status === 'completed' ? 'completed' : 'upcoming'
}

/**
 * Recompute the lifecycle status from dates. The `status` column is stored for
 * indexing, but date-derived truth always wins because it stays correct as
 * time passes without needing a write.
 */
export function effectiveStatus(hackathon, reference = now()) {
  return statusOf(hackathon, reference)
}

function matchesStatus(hackathon, statuses, reference) {
  if (!statuses.length) return true
  const actual = effectiveStatus(hackathon, reference)
  return statuses.some((s) => {
    if (s === 'newly-added') {
      if (!hackathon.firstDiscoveredAt) return false
      const age = (reference - new Date(hackathon.firstDiscoveredAt)) / 86_400_000
      return age <= NEWLY_ADDED_WINDOW_DAYS
    }
    return s === actual
  })
}

function matchesRegistration(hackathon, modes, reference, closingSoonDays) {
  if (!modes.length) return true
  const deadline = hackathon.registrationDeadline ? new Date(hackathon.registrationDeadline) : null
  const open = hackathon.registrationOpen
  const days = deadline ? daysUntil(hackathon.registrationDeadline, reference) : null

  return modes.some((mode) => {
    switch (mode) {
      case 'open':
        if (deadline && deadline < reference) return false
        return open === true
      case 'closing-soon':
        return days !== null && days >= 0 && days <= closingSoonDays
      case 'closed':
        return (deadline && deadline < reference) || open === false
      default:
        return true
    }
  })
}

function matchesAnyIn(hackathon, values, field) {
  if (!values.length) return true
  const list = Array.isArray(hackathon[field]) ? hackathon[field] : []
  const normalised = list.map((v) => String(v).toLowerCase())
  const primary = hackathon[field === 'technologies' ? 'category' : field]
  if (primary) normalised.push(String(primary).toLowerCase())
  return values.some((v) => normalised.includes(v))
}

/**
 * Make a comparator total.
 *
 * Two events with the same prize, the same date or the same title would
 * otherwise be ordered by whatever order they happened to arrive in. Because
 * the API paginates, a non-total comparator lets a record appear on page 1 and
 * page 2, or on neither. Every sort therefore ends in a stable tiebreaker.
 */
const byTitle = (a, b) =>
  String(a.title ?? '').localeCompare(String(b.title ?? ''), 'en') ||
  String(a.id ?? '').localeCompare(String(b.id ?? ''), 'en')

const total = (compare) => (a, b) => compare(a, b) || byTitle(a, b)

const SORTERS = {
  'recently-discovered': total((a, b) =>
    new Date(b.firstDiscoveredAt ?? 0) - new Date(a.firstDiscoveredAt ?? 0),
  ),
  'registration-deadline': total((a, b) => {
    const av = a.registrationDeadline ? new Date(a.registrationDeadline).getTime() : Infinity
    const bv = b.registrationDeadline ? new Date(b.registrationDeadline).getTime() : Infinity
    // Hackathons without a deadline sink rather than lead.
    if (av === Infinity && bv === Infinity) return 0
    return av - bv
  }),
  'start-date': total((a, b) => {
    const av = a.startDate ? new Date(a.startDate).getTime() : Infinity
    const bv = b.startDate ? new Date(b.startDate).getTime() : Infinity
    if (av === Infinity && bv === Infinity) return 0
    return av - bv
  }),
  'prize-pool': total((a, b) => {
    // Normalise currencies crudely so "1000 USD" can outrank "900 EUR".
    const av = a.prizePool ?? 0
    const bv = b.prizePool ?? 0
    if (!av && !bv) return 0
    if (!av) return 1
    if (!bv) return -1
    return bv - av
  }),
  alphabetical: total((a, b) => String(a.title ?? '').localeCompare(String(b.title ?? ''), 'en')),
  relevance: total(
    (a, b) => (b.__score ?? 0) - (a.__score ?? 0) || SORTERS['recently-discovered'](a, b),
  ),
}

/**
 * @param {object[]} rows
 * @param {object} params — already parsed (see parseQuery in routes)
 */
export function searchHackathons(rows, params = {}) {
  const reference = params.now ? new Date(params.now) : now()
  const closingSoonDays = params.closingSoonDays ?? 5

  const q = (params.q ?? '').trim()
  const statuses = asArray(params.status)
  const registration = asArray(params.registration)
  const formats = asArray(params.format)
  const categories = asArray(params.category)
  const technologies = asArray(params.technology)
  const countries = asArray(params.country)
  const difficulties = asArray(params.difficulty)

  const dateFrom = params.dateFrom ? new Date(params.dateFrom) : null
  const dateTo = params.dateTo ? new Date(params.dateTo) : null
  const validDateFrom = dateFrom && !Number.isNaN(dateFrom.getTime()) ? dateFrom : null
  // Treat dateTo as inclusive of the whole day.
  const validDateTo =
    dateTo && !Number.isNaN(dateTo.getTime())
      ? new Date(dateTo.getTime() + 86_400_000 - 1)
      : null

  let out = rows.filter((h) => {
    if (!matchesText(h, q)) return false
    if (!matchesStatus(h, statuses, reference)) return false
    if (!matchesRegistration(h, registration, reference, closingSoonDays)) return false
    if (formats.length && !formats.includes(h.eventFormat ?? 'unknown')) return false
    if (categories.length && !categories.includes((h.category ?? '').toLowerCase())) return false
    if (!matchesAnyIn(h, technologies, 'technologies')) return false
    if (countries.length) {
      const haystack = [h.country, h.location].filter(Boolean).join(' ').toLowerCase()
      if (!countries.some((c) => haystack.includes(c))) return false
    }
    if (difficulties.length) {
      // Only offered when the source actually publishes an eligibility level.
      const level = h.eligibilityLevel
      if (!level || !difficulties.includes(String(level).toLowerCase())) return false
    }
    // The four boolean facets are genuine three-state filters: `undefined`
    // (absent from the query) means no restriction, and an explicit `false`
    // selects the inverse. Reading them with `=== true` made `?prize=false`,
    // `?free=false` and `?featured=false` into silent no-ops that still
    // rendered an active filter chip.
    //
    // Each comparison is against the row's boolean *projection*, never its raw
    // value. `h.isFree === params.freeOnly` looks equivalent and is not: the
    // `false` branch then only matched rows where the source literally stored
    // `false`, which no row does — the usual value is `null`, meaning unknown.
    //
    // "Free to enter" is asserted, not inferred. `isPaid === null` means the
    // source published no fee, and 576 of 839 events are in that state
    // (Devpost, HackerEarth and Devfolio publish none), so treating unknown
    // as free would return 777 rows whose own card says "Fee not stated".
    if (typeof params.freeOnly === 'boolean' && (h.isFree === true) !== params.freeOnly) {
      return false
    }
    if (typeof params.prizeOnly === 'boolean' && (h.prizePool > 0) !== params.prizeOnly) {
      return false
    }
    if (
      typeof params.beginnerFriendly === 'boolean' &&
      (h.beginnerFriendly === true) !== params.beginnerFriendly
    ) {
      return false
    }
    if (typeof params.featuredOnly === 'boolean' && Boolean(h.featured) !== params.featuredOnly) {
      return false
    }

    if (validDateFrom) {
      const end = h.endDate ? new Date(h.endDate) : h.startDate ? new Date(h.startDate) : null
      // Keep events that are still running or start after the window opens.
      if (!end || end < validDateFrom) return false
    }
    if (validDateTo) {
      const start = h.startDate ? new Date(h.startDate) : h.endDate ? new Date(h.endDate) : null
      if (!start || start > validDateTo) return false
    }
    return true
  })

  if (q) {
    out = out.map((h) => ({ ...h, __score: scoreMatch(h, q) }))
    // Require a minimum signal so a typo doesn't return the whole catalogue.
    const best = Math.max(...out.map((h) => h.__score), 0)
    if (best > 0) {
      const floor = Math.max(0.35, best * 0.12)
      out = out.filter((h) => h.__score >= floor)
    }
  }

  const sorter = SORTERS[params.sort] ?? SORTERS['recently-discovered']
  out = [...out].sort(sorter)

  // Prefer events users can still act on when the sort is date-based.
  if (!q && params.sort === 'start-date') {
    const ref = reference.getTime()
    const bucket = (h) => {
      const start = h.startDate ? new Date(h.startDate).getTime() : Infinity
      if (start <= ref) return 0 // ongoing / past
      return 1 // future
    }
    out.sort((a, b) => bucket(a) - bucket(b) || SORTERS['start-date'](a, b))
  }

  // `__score` is an internal ranking artefact. Leaving it on the record would
  // put a synthetic field into every API response and into the datastore's
  // read path, so it is stripped before the records are handed back.
  if (q) out = out.map(({ __score, ...record }) => record)

  return out
}

export function buildFacets(rows) {
  const counts = new Map()
  for (const row of rows) {
    if (row.category) {
      const key = String(row.category).toLowerCase()
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return {
    categories: [...counts.entries()]
      .map(([value, count]) => ({
        value,
        count,
        label: CATEGORY_KEYS[value] ?? value,
      }))
      .sort((a, b) => b.count - a.count),
  }
}

/** Catalogue-wide counts, used by the home page hero and category grid. */
export function aggregateCounts(rows, reference = now()) {
  const summary = {
    total: rows.length,
    upcoming: 0,
    ongoing: 0,
    completed: 0,
    newlyAdded: 0,
    online: 0,
    offline: 0,
    hybrid: 0,
    withPrize: 0,
    registrationOpen: 0,
    closingSoon: 0,
    categories: {},
    countries: {},
    technologies: {},
  }

  const techCounts = new Map()
  const countryCounts = new Map()

  for (const row of rows) {
    const status = effectiveStatus(row, reference)
    if (status === 'upcoming') summary.upcoming += 1
    else if (status === 'ongoing') summary.ongoing += 1
    else if (status === 'completed') summary.completed += 1

    if (row.firstDiscoveredAt) {
      const age = (reference - new Date(row.firstDiscoveredAt)) / 86_400_000
      if (age <= NEWLY_ADDED_WINDOW_DAYS) summary.newlyAdded += 1
    }

    if (row.eventFormat === 'online') summary.online += 1
    else if (row.eventFormat === 'offline') summary.offline += 1
    else if (row.eventFormat === 'hybrid') summary.hybrid += 1

    if (row.prizePool > 0) summary.withPrize += 1

    const deadline = row.registrationDeadline ? new Date(row.registrationDeadline) : null
    if (deadline && deadline >= reference && row.registrationOpen) summary.registrationOpen += 1
    const days = daysUntil(row.registrationDeadline, reference)
    if (days !== null && days >= 0 && days <= 5) summary.closingSoon += 1

    const cat = row.category ? String(row.category).toLowerCase() : null
    if (cat) summary.categories[cat] = (summary.categories[cat] ?? 0) + 1

    if (row.country) {
      const c = String(row.country).trim()
      if (c) countryCounts.set(c, (countryCounts.get(c) ?? 0) + 1)
    }
    for (const tech of row.technologies ?? []) {
      if (!tech) continue
      techCounts.set(tech, (techCounts.get(tech) ?? 0) + 1)
    }
  }

  summary.countries = Object.fromEntries([...countryCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40))
  summary.technologies = Object.fromEntries(
    [...techCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60),
  )
  return summary
}

export { asArray, NEWLY_ADDED_WINDOW_DAYS }
