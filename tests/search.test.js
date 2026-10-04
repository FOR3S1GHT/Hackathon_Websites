import { describe, expect, it } from 'vitest'
import {
  FORMAT_OPTIONS,
  NEWLY_ADDED_WINDOW_DAYS,
  SORT_OPTIONS,
  STATUS_OPTIONS,
  aggregateCounts,
  asArray,
  buildFacets,
  effectiveStatus,
  scoreMatch,
  searchHackathons,
} from '@server/services/search.js'
import { makeNormalized } from './helpers/fixtures.js'

const REFERENCE = '2030-06-01T12:00:00.000Z'
const REFERENCE_DATE = new Date(REFERENCE)
const day = 86_400_000
const iso = (offsetDays) => new Date(REFERENCE_DATE.getTime() + offsetDays * day).toISOString()

/** Every test runs against a fixed clock so nothing depends on the real date. */
const search = (rows, params = {}) => searchHackathons(rows, { ...params, now: REFERENCE })

/**
 * A small but representative catalogue: every status, every format, five
 * categories, one record per source, and records with genuinely missing data.
 */
const CATALOGUE = [
  makeNormalized({
    title: 'Smart India Hackathon',
    organizer: 'Smart India',
    category: 'artificial-intelligence',
    technologies: ['Python', 'React'],
    themes: ['AI'],
    startDate: iso(-2),
    endDate: iso(2),
    registrationDeadline: iso(10),
    registrationOpen: true,
    eventFormat: 'offline',
    location: 'Bengaluru, India',
    country: 'India',
    prizePool: 500000,
    currency: 'INR',
    isFree: true,
    isPaid: false,
    beginnerFriendly: true,
    eligibilityLevel: 'open',
    firstDiscoveredAt: iso(-60),
    sourceName: 'devpost',
    featured: true,
  }),
  makeNormalized({
    title: 'Blockchain Builders Summit',
    organizer: 'Chain Labs',
    category: 'blockchain-web3',
    technologies: ['Solidity', 'Node.js'],
    startDate: iso(20),
    endDate: iso(22),
    registrationDeadline: iso(5),
    registrationOpen: true,
    eventFormat: 'online',
    location: 'Online',
    prizePool: 25000,
    currency: 'USD',
    isPaid: true,
    firstDiscoveredAt: iso(-3),
    sourceName: 'unstop',
  }),
  makeNormalized({
    title: 'Global Climate Sprint',
    organizer: 'Green Earth',
    category: 'sustainability',
    technologies: ['Python'],
    startDate: iso(-90),
    endDate: iso(-88),
    registrationOpen: false,
    eventFormat: 'hybrid',
    location: 'Berlin, Germany',
    country: 'Germany',
    firstDiscoveredAt: iso(-200),
    sourceName: 'devfolio',
  }),
  makeNormalized({
    title: 'Robotics Open Jam',
    organizer: 'Robo Lab',
    category: 'robotics',
    technologies: ['Arduino', 'Python'],
    startDate: iso(-1),
    endDate: iso(1),
    registrationDeadline: iso(-1),
    registrationOpen: false,
    eventFormat: 'offline',
    location: 'Toronto, Canada',
    country: 'Canada',
    firstDiscoveredAt: iso(-1),
    sourceName: 'hackerearth',
  }),
  makeNormalized({
    title: 'Quiet Data Science Afternoon',
    organizer: 'Data Guild',
    category: 'data-science',
    technologies: ['Python', 'SQL'],
    startDate: iso(60),
    endDate: iso(61),
    // Deliberately unknown: HackerEarth publishes no venue, so neither
    // "online" nor "offline" would be truthful.
    eventFormat: 'unknown',
    location: null,
    country: null,
    firstDiscoveredAt: iso(-1),
    sourceName: 'devpost',
  }),
]

describe('asArray', () => {
  it('returns an empty array for nullish and empty input', () => {
    expect(asArray(undefined)).toEqual([])
    expect(asArray(null)).toEqual([])
    expect(asArray('')).toEqual([])
  })

  it('splits a comma-separated query string so one param means "OR"', () => {
    expect(asArray('ongoing,upcoming')).toEqual(['ongoing', 'upcoming'])
  })

  it('lowercases and trims so filter values compare consistently', () => {
    expect(asArray(' Ongoing , UPCOMING ')).toEqual(['ongoing', 'upcoming'])
  })

  it('accepts an array as well as a string', () => {
    expect(asArray(['Ongoing', 'Upcoming'])).toEqual(['ongoing', 'upcoming'])
  })

  it('drops empty segments from a trailing or doubled comma', () => {
    expect(asArray('online,,')).toEqual(['online'])
  })
})

describe('effectiveStatus', () => {
  it('derives "ongoing" from the real date range, not the stored label', () => {
    const record = makeNormalized({ status: 'upcoming', startDate: iso(-1), endDate: iso(1) })
    expect(effectiveStatus(record, REFERENCE_DATE)).toBe('ongoing')
  })

  it('derives "completed" once the end date has passed', () => {
    const record = makeNormalized({ status: 'ongoing', startDate: iso(-30), endDate: iso(-20) })
    expect(effectiveStatus(record, REFERENCE_DATE)).toBe('completed')
  })

  it('derives "upcoming" before the start date', () => {
    const record = makeNormalized({ status: 'ongoing', startDate: iso(5), endDate: iso(6) })
    expect(effectiveStatus(record, REFERENCE_DATE)).toBe('upcoming')
  })

  it('treats an open-ended event that has started as ongoing', () => {
    const record = makeNormalized({ startDate: iso(-3), endDate: null })
    expect(effectiveStatus(record, REFERENCE_DATE)).toBe('ongoing')
  })

  it('never returns a status the filter UI cannot display', () => {
    // Even with no dates at all there is a defined answer, because every
    // record must land in exactly one bucket.
    const record = makeNormalized({ status: null, startDate: null, endDate: null })
    expect(['upcoming', 'ongoing', 'completed']).toContain(
      effectiveStatus(record, REFERENCE_DATE),
    )
  })

  it('propagates a cancellation instead of quietly showing it as completed', () => {
    const record = makeNormalized({ status: 'cancelled', startDate: iso(-10), endDate: iso(-9) })
    expect(effectiveStatus(record, REFERENCE_DATE)).toBe('cancelled')
  })
})

describe('searchHackathons — free text', () => {
  it('returns every record when there is no query', () => {
    expect(search(CATALOGUE, {})).toHaveLength(CATALOGUE.length)
  })

  it('matches on title, case-insensitively', () => {
    expect(search(CATALOGUE, { q: 'SMART INDIA' }).map((h) => h.title)).toEqual([
      'Smart India Hackathon',
    ])
  })

  it('matches on organiser', () => {
    expect(search(CATALOGUE, { q: 'chain labs' }).map((h) => h.title)).toEqual([
      'Blockchain Builders Summit',
    ])
  })

  it('matches on technology label', () => {
    expect(search(CATALOGUE, { q: 'solidity' })).toHaveLength(1)
  })

  it('matches on location and on country', () => {
    expect(search(CATALOGUE, { q: 'berlin' })).toHaveLength(1)
    expect(search(CATALOGUE, { q: 'canada' })).toHaveLength(1)
  })

  it('matches a partial word at the start of a token, so typing works', () => {
    expect(search(CATALOGUE, { q: 'blockch' })).toHaveLength(1)
    expect(search(CATALOGUE, { q: 'pyth' }).length).toBeGreaterThanOrEqual(1)
  })

  it('requires every term to match, not any term', () => {
    expect(search(CATALOGUE, { q: 'smart zzzznotathing' })).toHaveLength(0)
  })

  it('returns an empty array for a query that matches nothing', () => {
    expect(search(CATALOGUE, { q: 'zzzznotathing' })).toEqual([])
  })

  it('treats a whitespace-only query as no query', () => {
    expect(search(CATALOGUE, { q: '   ' })).toHaveLength(CATALOGUE.length)
  })

  it('does not let a short term match inside an unrelated word', () => {
    // Raw substring matching made "ai" match "blockchain", "ar" match
    // "start" and "ml" match "html". Short queries are the ones users type
    // most, so this is the case that matters.
    expect(search(CATALOGUE, { q: 'ai' }).map((h) => h.title)).toEqual(['Smart India Hackathon'])
    expect(search(CATALOGUE, { q: 'html' })).toHaveLength(0)
  })

  it('ranks a title match above a body-only match', () => {
    const hits = search(CATALOGUE, { q: 'robotics' })
    expect(hits[0].title).toBe('Robotics Open Jam')
    expect(scoreMatch(CATALOGUE[3], 'robotics')).toBeGreaterThan(
      scoreMatch(CATALOGUE[0], 'robotics'),
    )
  })

  it('does not mutate the input array', () => {
    const snapshot = CATALOGUE.map((h) => h.title)
    search(CATALOGUE, { q: 'python', sort: 'prize-pool' })
    expect(CATALOGUE.map((h) => h.title)).toEqual(snapshot)
  })

  it('does not leak its internal relevance score into the results', () => {
    for (const hit of search(CATALOGUE, { q: 'python' })) {
      expect(hit).not.toHaveProperty('__score')
    }
  })
})

describe('searchHackathons — filters', () => {
  it('filters by a single status', () => {
    expect(search(CATALOGUE, { status: 'ongoing' })).toHaveLength(2)
    expect(search(CATALOGUE, { status: 'upcoming' })).toHaveLength(2)
    expect(search(CATALOGUE, { status: 'completed' })).toHaveLength(1)
  })

  it('treats multiple statuses as OR, from a comma string or an array', () => {
    expect(search(CATALOGUE, { status: 'upcoming,ongoing' })).toHaveLength(4)
    expect(search(CATALOGUE, { status: ['upcoming', 'ongoing'] })).toHaveLength(4)
  })

  it('filters by newly-added using first_discovered_at, not the start date', () => {
    const fresh = search(CATALOGUE, { status: 'newly-added' })
    expect(fresh.map((h) => h.title).sort()).toEqual([
      'Blockchain Builders Summit',
      'Quiet Data Science Afternoon',
      'Robotics Open Jam',
    ])
    for (const record of fresh) {
      const age = (REFERENCE_DATE - new Date(record.firstDiscoveredAt)) / day
      expect(age).toBeLessThanOrEqual(NEWLY_ADDED_WINDOW_DAYS)
    }
  })

  it('filters by category using taxonomy keys', () => {
    expect(search(CATALOGUE, { category: 'robotics' })).toHaveLength(1)
  })

  it('filters by technology using the stored label, case-insensitively', () => {
    expect(search(CATALOGUE, { technology: 'Python' })).toHaveLength(4)
    expect(search(CATALOGUE, { technology: 'python' })).toHaveLength(4)
  })

  it('treats multiple technologies as OR, not AND', () => {
    const hits = search(CATALOGUE, { technology: 'Arduino,SQL' }).map((h) => h.title)
    expect(hits.sort()).toEqual(['Quiet Data Science Afternoon', 'Robotics Open Jam'])
  })

  it('filters by event format', () => {
    expect(search(CATALOGUE, { format: 'online' })).toHaveLength(1)
    expect(search(CATALOGUE, { format: 'offline' })).toHaveLength(2)
    expect(search(CATALOGUE, { format: 'hybrid' })).toHaveLength(1)
  })

  it('keeps an unknown format addressable as its own value', () => {
    // "Unknown" is a real state, not a gap in the data: calling it online or
    // offline would be a fabrication.
    expect(search(CATALOGUE, { format: 'unknown' }).map((h) => h.title)).toEqual([
      'Quiet Data Science Afternoon',
    ])
  })

  it('filters by country, matching the free-text location too', () => {
    expect(search(CATALOGUE, { country: 'India' })).toHaveLength(1)
    expect(search(CATALOGUE, { country: 'Germany' })).toHaveLength(1)
  })

  it('filters by eligibility difficulty, and drops records that publish none', () => {
    expect(search(CATALOGUE, { difficulty: 'open' })).toHaveLength(1)
    expect(search(CATALOGUE, { difficulty: 'advanced' })).toHaveLength(0)
  })

  // `isFree` is an assertion the source made, not an inference from `isPaid`.
  // Only one fixture has it, and `freeOnly` must return exactly that one — an
  // "unknown fee" row is not a "free" row.
  it('freeOnly returns only events whose source stated they are free', () => {
    expect(search(CATALOGUE, { freeOnly: true }).map((h) => h.title)).toEqual(['Smart India Hackathon'])
  })

  it('freeOnly=false returns everything not affirmatively free', () => {
    const hits = search(CATALOGUE, { freeOnly: false }).map((h) => h.title)
    expect(hits).not.toContain('Smart India Hackathon')
    expect(hits).toHaveLength(CATALOGUE.length - 1)
  })

  it('filters by published prize amount only — never by "probably has a prize"', () => {
    expect(search(CATALOGUE, { prizeOnly: true }).map((h) => h.title).sort()).toEqual([
      'Blockchain Builders Summit',
      'Smart India Hackathon',
    ])
  })

  it('prizeOnly=false selects the inverse, not "no filter"', () => {
    expect(search(CATALOGUE, { prizeOnly: false }).map((h) => h.title).sort()).toEqual([
      'Global Climate Sprint',
      'Quiet Data Science Afternoon',
      'Robotics Open Jam',
    ])
  })

  it('filters by beginner-friendly', () => {
    expect(search(CATALOGUE, { beginnerFriendly: true })).toHaveLength(1)
  })

  it('beginnerFriendly=false selects the inverse', () => {
    expect(search(CATALOGUE, { beginnerFriendly: false })).toHaveLength(CATALOGUE.length - 1)
  })

  it('filters by featured', () => {
    expect(search(CATALOGUE, { featuredOnly: true })).toHaveLength(1)
  })

  it('featuredOnly=false selects the inverse', () => {
    expect(search(CATALOGUE, { featuredOnly: false })).toHaveLength(CATALOGUE.length - 1)
  })

  it('leaves every boolean facet unrestricted when the flag is absent', () => {
    expect(search(CATALOGUE, {})).toHaveLength(CATALOGUE.length)
    expect(search(CATALOGUE, { freeOnly: undefined, prizeOnly: undefined })).toHaveLength(
      CATALOGUE.length,
    )
  })

  it('filters by registration still open', () => {
    const open = search(CATALOGUE, { registration: 'open' }).map((h) => h.title)
    expect(open.sort()).toEqual(['Blockchain Builders Summit', 'Smart India Hackathon'])
  })

  it('filters by registration closing soon', () => {
    const soon = search(CATALOGUE, { registration: 'closing-soon' }).map((h) => h.title)
    expect(soon).toEqual(['Blockchain Builders Summit'])
  })

  it('filters by registration closed', () => {
    const closed = search(CATALOGUE, { registration: 'closed' }).map((h) => h.title).sort()
    expect(closed).toEqual(['Global Climate Sprint', 'Robotics Open Jam'])
  })

  it('honours a custom closing-soon window', () => {
    expect(search(CATALOGUE, { registration: 'closing-soon', closingSoonDays: 30 })).toHaveLength(2)
  })

  it('filters by a date window, keeping anything overlapping it', () => {
    const hits = search(CATALOGUE, { dateFrom: iso(0), dateTo: iso(30) }).map((h) => h.title)
    expect(hits.sort()).toEqual([
      'Blockchain Builders Summit',
      'Robotics Open Jam',
      'Smart India Hackathon',
    ])
  })

  it('treats the upper date bound as inclusive of the whole day', () => {
    // An event starting at 00:00 on the boundary day must be inside the window.
    const onBoundary = [
      makeNormalized({ title: 'Boundary Event', startDate: iso(30), endDate: iso(31) }),
    ]
    expect(search(onBoundary, { dateFrom: iso(0), dateTo: iso(30) })).toHaveLength(1)
  })

  it('combines search, filters and sort in one call', () => {
    const hits = search(CATALOGUE, {
      q: 'python',
      status: 'ongoing,upcoming',
      format: 'offline',
      sort: 'start-date',
    }).map((h) => h.title)
    expect(hits).toEqual(['Smart India Hackathon', 'Robotics Open Jam'])
  })

  it('returns an empty array when filters are mutually exclusive', () => {
    expect(search(CATALOGUE, { status: 'completed', format: 'online' })).toEqual([])
  })

  it('ignores an unknown status or format instead of erroring', () => {
    expect(() => search(CATALOGUE, { status: 'nonsense' })).not.toThrow()
    expect(search(CATALOGUE, { status: 'nonsense' })).toHaveLength(0)
    expect(search(CATALOGUE, { format: 'nonsense' })).toHaveLength(0)
  })

  it('ignores an unknown sort value instead of erroring', () => {
    expect(() => search(CATALOGUE, { sort: 'nonsense' })).not.toThrow()
    expect(search(CATALOGUE, { sort: 'nonsense' })).toHaveLength(CATALOGUE.length)
  })

  it('ignores an unparseable date range instead of returning nothing', () => {
    expect(search(CATALOGUE, { dateFrom: 'not-a-date', dateTo: 'also-not' })).toHaveLength(
      CATALOGUE.length,
    )
  })
})

describe('searchHackathons — sorting', () => {
  it('sorts by prize, highest first, with unpublished prizes last', () => {
    const hits = search(CATALOGUE, { sort: 'prize-pool' })
    expect(hits[0].prizePool).toBe(500000)
    const firstUnknown = hits.findIndex((h) => !h.prizePool)
    const lastKnown = hits.map((h) => Boolean(h.prizePool)).lastIndexOf(true)
    expect(firstUnknown).toBeGreaterThan(lastKnown)
  })

  it('sorts by start date, soonest first, and puts no-date records last', () => {
    const hits = search(CATALOGUE, { sort: 'start-date' })
    const dates = hits.filter((h) => h.startDate).map((h) => new Date(h.startDate).getTime())
    expect([...dates].sort((a, b) => a - b)).toEqual(dates)
  })

  it('sorts by registration deadline, soonest first, undeclared deadlines last', () => {
    const hits = search(CATALOGUE, { sort: 'registration-deadline' })
    const deadlines = hits
      .filter((h) => h.registrationDeadline)
      .map((h) => new Date(h.registrationDeadline).getTime())
    expect([...deadlines].sort((a, b) => a - b)).toEqual(deadlines)
    expect(hits[hits.length - 1].registrationDeadline).toBeNull()
  })

  it('sorts by most recently discovered', () => {
    const hits = search(CATALOGUE, { sort: 'recently-discovered' })
    const stamps = hits.map((h) => new Date(h.firstDiscoveredAt).getTime())
    expect([...stamps].sort((a, b) => b - a)).toEqual(stamps)
  })

  it('sorts alphabetically', () => {
    const titles = search(CATALOGUE, { sort: 'alphabetical' }).map((h) => h.title)
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b, 'en')))
  })

  it('is a pure reordering — no record is dropped or duplicated by any sort', () => {
    for (const option of SORT_OPTIONS) {
      const hits = search(CATALOGUE, { sort: option.value })
      expect(hits, option.value).toHaveLength(CATALOGUE.length)
      expect(new Set(hits.map((h) => h.id)).size, option.value).toBe(CATALOGUE.length)
    }
  })

  it('produces the same order regardless of input order, so paging is stable', () => {
    const reversed = [...CATALOGUE].reverse()
    for (const option of ['start-date', 'prize-pool', 'alphabetical', 'recently-discovered']) {
      expect(
        search(reversed, { sort: option }).map((h) => h.id),
        option,
      ).toEqual(search(CATALOGUE, { sort: option }).map((h) => h.id))
    }
  })

  it('prefers actionable events over archived ones when sorting by start date', () => {
    const hits = search(CATALOGUE, { sort: 'start-date' })
    const firstPast = hits.findIndex((h) => new Date(h.startDate) <= REFERENCE_DATE)
    const lastFuture = hits.map((h) => new Date(h.startDate) > REFERENCE_DATE).lastIndexOf(true)
    if (firstPast !== -1 && lastFuture !== -1) {
      expect(firstPast).toBeLessThan(lastFuture)
    }
  })
})

describe('buildFacets', () => {
  const facets = buildFacets(CATALOGUE)

  it('counts every record exactly once across categories', () => {
    const total = facets.categories.reduce((sum, c) => sum + c.count, 0)
    expect(total).toBe(CATALOGUE.length)
  })

  it('uses taxonomy keys as facet values and human labels for display', () => {
    const robotics = facets.categories.find((c) => c.value === 'robotics')
    expect(robotics).toBeDefined()
    expect(robotics.label).toBe('Robotics')
    expect(robotics.count).toBe(1)
  })

  it('falls back to the raw value when a category is not in the taxonomy', () => {
    const rows = [makeNormalized({ title: 'Odd', category: 'space-travel' })]
    expect(buildFacets(rows).categories[0].label).toBe('space-travel')
  })

  it('sorts facet lists by descending count', () => {
    const counts = facets.categories.map((c) => c.count)
    expect([...counts].sort((a, b) => b - a)).toEqual(counts)
  })

  it('returns zeroed facets for an empty catalogue instead of throwing', () => {
    expect(buildFacets([]).categories).toEqual([])
  })
})

describe('aggregateCounts', () => {
  const counts = aggregateCounts(CATALOGUE, REFERENCE_DATE)

  it('counts the whole catalogue, not a filtered page', () => {
    expect(counts.total).toBe(CATALOGUE.length)
  })

  it('partitions the catalogue by lifecycle status with nothing lost', () => {
    expect(counts.upcoming + counts.ongoing + counts.completed).toBe(CATALOGUE.length)
    expect(counts.ongoing).toBe(2)
    expect(counts.completed).toBe(1)
  })

  it('counts formats, and does not pretend an unknown format is online', () => {
    expect(counts.online).toBe(1)
    expect(counts.offline).toBe(2)
    expect(counts.hybrid).toBe(1)
    expect(counts.online + counts.offline + counts.hybrid).toBeLessThan(counts.total)
  })

  it('counts published prizes only', () => {
    expect(counts.withPrize).toBe(2)
  })

  it('counts newly-added inside the documented window', () => {
    expect(counts.newlyAdded).toBe(3)
  })

  it('counts open registrations and near deadlines', () => {
    expect(counts.registrationOpen).toBe(2)
    expect(counts.closingSoon).toBe(1)
  })

  it('exposes per-category, per-country and per-technology breakdowns', () => {
    expect(counts.categories.robotics).toBe(1)
    expect(counts.countries.India).toBe(1)
    expect(counts.technologies.Python).toBe(4)
  })

  it('returns an all-zero summary for an empty catalogue', () => {
    const empty = aggregateCounts([], REFERENCE_DATE)
    expect(empty.total).toBe(0)
    expect(empty.upcoming).toBe(0)
    expect(Object.keys(empty.categories)).toHaveLength(0)
  })
})

describe('option catalogues', () => {
  it('exposes unique, labelled sort options', () => {
    const values = SORT_OPTIONS.map((o) => o.value)
    expect(new Set(values).size).toBe(values.length)
    for (const option of SORT_OPTIONS) {
      expect(option.label).toBeTruthy()
      expect(option.value).toBeTruthy()
    }
  })

  it('offers the three lifecycle statuses plus newly-added', () => {
    expect(STATUS_OPTIONS.map((s) => s.value).sort()).toEqual([
      'completed',
      'newly-added',
      'ongoing',
      'upcoming',
    ])
  })

  it('offers exactly the three real formats — it never offers "unknown" as a choice', () => {
    expect(FORMAT_OPTIONS.map((f) => f.value).sort()).toEqual(['hybrid', 'offline', 'online'])
  })

  it('documents the newly-added window as a positive number of days', () => {
    expect(NEWLY_ADDED_WINDOW_DAYS).toBeGreaterThan(0)
  })
})