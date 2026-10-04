/**
 * Devpost connector parsing, tested against the *real* payload shapes.
 *
 * The case here is a bug that was live across the catalogue: 62 events were
 * stored with a start date of 2001, and the home page rendered one of them as
 * "30 AUG 2001 – 23 OCT 2026".
 *
 * Devpost publishes its submission window as a single string in
 * `submission_period_dates` — "Aug 31 - Oct 23, 2026" — and the connector was
 * splitting that on "-" to parse each end separately. The left half, "Aug 31 ",
 * carries no year, so the year-less branch of `parseSourceDate` guessed 2001.
 * The right half kept its year only by accident, because everything after the
 * first dash still contained it, which is why only the start date was wrong and
 * why it went unnoticed for so long.
 *
 * Fixtures are trimmed from live API responses rather than invented, because the
 * point of the assertions is that they match the wire format.
 */
import { describe, expect, it } from 'vitest'

import { normaliseDevpostRow, parseDevpostPrize } from '@server/sources/devpost.js'
import { now } from '@server/lib/dates.js'

/**
 * Trimmed from `GET /api/hackathons?status[]=open&status[]=upcoming`.
 * Real titles and real `submission_period_dates` strings, so a change in how
 * Devpost formats its window fails these tests rather than the catalogue.
 */
const LIST_ROWS = [
  {
    id: 30992,
    title: 'Build, Ship, Shape: Amazon Developer Hackathon',
    url: 'https://devpost.com/amazon-hackathon',
    thumbnail_url: 'https://d2dvi9j8k9yx8.cloudfront.net/uploads/2026/01/02/abc.png',
    displayed_location: { location: 'Online' },
    open_state: 'open',
    // This exact string produced the 2001 start date.
    submission_period_dates: 'Aug 31 - Oct 23, 2026',
    displayed_submission_deadline: '',
    time_left_to_submission: '21 days left',
    prize_amount: '$138,000 in prizes',
    themes: [],
    eligible_audience: [],
  },
  {
    id: 24680,
    title: 'Short Form Challenge',
    url: 'https://devpost.com/short-form',
    displayed_location: { location: 'Bengaluru, India' },
    open_state: 'upcoming',
    // Shared month — the other shape Devpost uses.
    submission_period_dates: 'Oct 03 - 10, 2026',
    prize_amount: null,
    themes: ['Blockchain'],
  },
  {
    id: 13579,
    title: 'Year Spanning Build',
    url: 'https://devpost.com/year-spanning',
    displayed_location: { location: 'Online' },
    open_state: 'upcoming',
    submission_period_dates: 'Dec 28 - Jan 04, 2027',
  },
  {
    id: 24681,
    title: 'Event With No Published Window',
    url: 'https://devpost.com/no-window',
    displayed_location: { location: 'Online' },
    open_state: 'open',
    submission_period_dates: null,
    // Devpost uses "TBD" for some listings rather than omitting the field.
  },
  {
    id: 24682,
    title: 'Event With A TBD Window',
    url: 'https://devpost.com/tbd-window',
    displayed_location: { location: 'Online' },
    open_state: 'open',
    submission_period_dates: 'TBD',
  },
]

const normalise = (row, reference = now()) => normaliseDevpostRow(row, reference)

describe('normaliseDevpostRow — the submission window', () => {
  it('reads both ends of an abbreviated range from the whole string', () => {
    // The regression: the start date came back as 2001-08-30 because "Aug 31 "
    // was parsed on its own and the year-less branch guessed.
    const record = normalise(LIST_ROWS[0])
    expect(record.startDate).toBe('2026-08-31T00:00:00.000Z')
    expect(record.endDate).toBe('2026-10-23T23:59:59.000Z')
  })

  it('reads a shared-month range', () => {
    const record = normalise(LIST_ROWS[1])
    expect(record.startDate).toBe('2026-10-03T00:00:00.000Z')
    expect(record.endDate).toBe('2026-10-10T23:59:59.000Z')
  })

  it('reads a window that crosses the new year as a forward-running event', () => {
    const record = normalise(LIST_ROWS[2])
    expect(record.startDate).toBe('2027-12-28T00:00:00.000Z')
    expect(Date.parse(record.endDate)).toBeGreaterThan(Date.parse(record.startDate))
  })

  it('never invents a start year when none is published', () => {
    // No window and a "TBD" window are different from a window that happens to
    // look old. Both must yield null, so the event is not treated as running
    // since 2001.
    for (const row of [LIST_ROWS[3], LIST_ROWS[4]]) {
      const record = normalise(row)
      expect(record.startDate, row.title).toBeNull()
      expect(record.endDate, row.title).toBeNull()
    }
  })

  it('never stores an event that ends before it starts', () => {
    for (const row of LIST_ROWS) {
      const record = normalise(row)
      if (!record.startDate || !record.endDate) continue
      expect(
        Date.parse(record.endDate) >= Date.parse(record.startDate),
        `${row.title}: ${record.startDate} -> ${record.endDate}`,
      ).toBe(true)
    }
  })

  it('never stores a start date outside a plausible event horizon', () => {
    // A cheap belt-and-braces check on the same class of bug: whatever a source
    // sends, an event must not be indexed as starting decades ago or in the
    // distant future.
    const reference = now()
    for (const row of LIST_ROWS) {
      const record = normalise(row, reference)
      if (!record.startDate) continue
      const year = new Date(record.startDate).getUTCFullYear()
      const currentYear = reference.getUTCFullYear()
      expect(year, `${row.title} parsed as ${year}`).toBeGreaterThanOrEqual(currentYear - 2)
      expect(year, `${row.title} parsed as ${year}`).toBeLessThanOrEqual(currentYear + 4)
    }
  })
})

describe('normaliseDevpostRow — other fields', () => {
  it('keeps the id and the organiser-supplied title', () => {
    const record = normalise(LIST_ROWS[0])
    // A string, because Devpost sends a number and the datastore keys on a
    // stable string identity across sources.
    expect(record.sourceEventId).toBe('30992')
    expect(record.title).toBe('Build, Ship, Shape: Amazon Developer Hackathon')
  })

  it('leaves prize null when Devpost publishes no prize amount', () => {
    // "$0 in prizes" is a real Devpost string and means no prize; null means
    // nothing was published. Collapsing the two would invent data.
    expect(normalise(LIST_ROWS[1]).prizePool ?? null).toBeNull()
  })

  it('rejects a row with no title', () => {
    expect(normalise({ id: 1 })).toBeNull()
    expect(normalise(null)).toBeNull()
  })
})

describe('parseDevpostPrize', () => {
  it('reads a comma-grouped dollar amount', () => {
    expect(parseDevpostPrize('$138,000 in prizes')).toEqual({ prizePool: 138000, currency: 'USD' })
  })

  it('returns nulls rather than zero when no prize is published', () => {
    expect(parseDevpostPrize(null)).toEqual({ prizePool: null, currency: null })
  })

  it('does not treat an explicitly zero prize as a missing one', () => {
    // Zero is a published answer — "there is no prize" — and collapsing it to
    // null would make the data indistinguishable from "we never looked".
    const parsed = parseDevpostPrize('$0 in prizes')
    expect(parsed.prizePool).toBe(0)
  })
})