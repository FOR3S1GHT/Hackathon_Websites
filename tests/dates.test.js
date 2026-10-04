import { describe, expect, it } from 'vitest'
import {
  daysUntil,
  formatDate,
  formatDateRange,
  isValidDate,
  parseRelativeDeadline,
  parseSourceDate,
  relativeTime,
  toIso,
} from '@server/lib/dates.js'

describe('toIso', () => {
  it('returns null for nullish input rather than "Invalid Date"', () => {
    expect(toIso(null)).toBeNull()
    expect(toIso(undefined)).toBeNull()
    expect(toIso('')).toBeNull()
  })

  it('normalises a Date to a full ISO string', () => {
    expect(toIso(new Date('2030-03-04T05:06:07Z'))).toBe('2030-03-04T05:06:07.000Z')
  })

  it('passes through a valid ISO string', () => {
    expect(toIso('2030-03-04T05:06:07.000Z')).toBe('2030-03-04T05:06:07.000Z')
  })

  it('returns null for an unparseable string instead of propagating NaN', () => {
    expect(toIso('not a date')).toBeNull()
    expect(toIso('2030-13-45')).toBeNull()
  })
})

describe('isValidDate', () => {
  it('accepts Date, ISO string and epoch milliseconds', () => {
    expect(isValidDate(new Date())).toBe(true)
    expect(isValidDate('2030-01-01T00:00:00Z')).toBe(true)
    expect(isValidDate(Date.now())).toBe(true)
  })

  it('rejects nonsense', () => {
    expect(isValidDate('soon')).toBe(false)
    expect(isValidDate(null)).toBe(false)
    expect(isValidDate({})).toBe(false)
  })
})

describe('parseSourceDate', () => {
  it('parses an ISO timestamp', () => {
    expect(parseSourceDate('2030-06-01T09:00:00Z')).toBe('2030-06-01T09:00:00.000Z')
  })

  it('parses a bare date as UTC midnight, not local midnight', () => {
    // A bare "2030-06-01" parsed by `new Date()` in a negative-offset timezone
    // becomes 2030-06-01T04:00Z locally. That is the bug this guards against.
    expect(parseSourceDate('2030-06-01')).toBe('2030-06-01T00:00:00.000Z')
  })

  it('parses "June 1, 2030"', () => {
    const parsed = parseSourceDate('June 1, 2030')
    expect(parsed).not.toBeNull()
    expect(new Date(parsed).getUTCFullYear()).toBe(2030)
  })

  it('parses an epoch in seconds as well as milliseconds', () => {
    expect(parseSourceDate(1767225600)).toBe('2026-01-01T00:00:00.000Z')
    expect(parseSourceDate(1767225600000)).toBe('2026-01-01T00:00:00.000Z')
  })

  it('returns null for empty input', () => {
    expect(parseSourceDate('')).toBeNull()
    expect(parseSourceDate(null)).toBeNull()
    expect(parseSourceDate('TBA')).toBeNull()
  })

  // A source publishes its whole window as one string. Devpost sends exactly
  // these shapes via `submission_period_dates`, and 62 real events were stored
  // with a 2001 start date because the connector split the string on "-" and
  // handed each half to this function separately — leaving the opening date with
  // no year, which the year-less branch guessed. Parsing the range whole is both
  // the fix and the reason these cases belong here.
  describe('period ranges published as a single string', () => {
    const start = (value) => parseSourceDate(value, { timeZone: 'UTC' })
    const end = (value) => parseSourceDate(value, { timeZone: 'UTC', endOfDay: true })

    it('reads both ends of an abbreviated range', () => {
      expect(start('Aug 31 - Oct 23, 2026')).toBe('2026-08-31T00:00:00.000Z')
      expect(end('Aug 31 - Oct 23, 2026')).toBe('2026-10-23T23:59:59.000Z')
    })

    it('reads a shared-month range like "Oct 03 - 10, 2026"', () => {
      expect(start('Oct 03 - 10, 2026')).toBe('2026-10-03T00:00:00.000Z')
      expect(end('Oct 03 - 10, 2026')).toBe('2026-10-10T23:59:59.000Z')
    })

    it('takes each end from its own month when the names are spelled out', () => {
      // The opening month was previously resolved by comparing against the
      // *closing* month and falling back when it missed. That fallback only held
      // because sources abbreviate while the lookup table spells out, so a fully
      // written range matched and the opening date became 31 October.
      expect(start('August 31 - October 23, 2026')).toBe('2026-08-31T00:00:00.000Z')
      expect(end('August 31 - October 23, 2026')).toBe('2026-10-23T23:59:59.000Z')
      expect(start('May 10 - June 11, 2026')).toBe('2026-05-10T00:00:00.000Z')
    })

    it('rolls the closing date into the next year when the window wraps', () => {
      // Only one year is written, so "Dec 28 - Jan 04, 2027" has to be read
      // somehow. Reading both ends as 2027 would store an event ending eleven
      // months before it begins, and every "upcoming" or "closing soon" query
      // would then be wrong about it. The written year anchors the opening date
      // and a backwards month means the window crosses into the next year.
      expect(start('Dec 28 - Jan 04, 2027')).toBe('2027-12-28T00:00:00.000Z')
      expect(end('Dec 28 - Jan 04, 2027')).toBe('2028-01-04T23:59:59.000Z')
    })

    it('accepts an en dash as the separator', () => {
      expect(start('Aug 31 – Oct 23, 2026')).toBe('2026-08-31T00:00:00.000Z')
    })

    it('treats a single date as a one-day window', () => {
      expect(start('Aug 31, 2026')).toBe('2026-08-31T00:00:00.000Z')
      expect(end('Aug 31, 2026')).toBe('2026-08-31T23:59:59.000Z')
    })

    it('never returns null for a well-formed range', () => {
      for (const value of [
        'Aug 31 - Oct 23, 2026',
        'October 3 - 10, 2026',
        'August 31 - October 23, 2026',
        'Jan 01 - Feb 02, 2027',
      ]) {
        expect(start(value), value).not.toBeNull()
        expect(end(value), value).not.toBeNull()
      }
    })

    it('always ends on or after it starts', () => {
      for (const value of [
        'Aug 31 - Oct 23, 2026',
        'October 3 - 10, 2026',
        'August 31 - October 23, 2026',
        'Dec 28 - Jan 04, 2027',
      ]) {
        expect(Date.parse(end(value)), value).toBeGreaterThanOrEqual(Date.parse(start(value)))
      }
    })
  })
})

describe('parseRelativeDeadline', () => {
  const reference = new Date('2030-06-01T12:00:00.000Z')

  it('reads "in 3 days"', () => {
    expect(parseRelativeDeadline('in 3 days', reference)).toBe('2030-06-04T12:00:00.000Z')
  })

  it('reads "closes tomorrow" as the end of the next day', () => {
    const parsed = parseRelativeDeadline('Submissions close tomorrow', reference)
    expect(parsed).toBe('2030-06-02T12:00:00.000Z')
  })

  it('reads "Last day to register" as the end of the next day', () => {
    expect(parseRelativeDeadline('Last day to register', reference)).toBe('2030-06-02T12:00:00.000Z')
  })

  it('reads "22 days left"', () => {
    expect(parseRelativeDeadline('22 days left', reference)).toBe('2030-06-23T12:00:00.000Z')
  })

  it('returns null when the event has already closed', () => {
    expect(parseRelativeDeadline('Winners announced', reference)).toBeNull()
    expect(parseRelativeDeadline('Submissions closed', reference)).toBeNull()
  })

  it('returns null when there is no relative signal in the text', () => {
    expect(parseRelativeDeadline('Register by 12 March', reference)).toBeNull()
  })
})

describe('daysUntil', () => {
  const reference = new Date('2030-06-01T12:00:00.000Z')

  it('never reports a negative countdown for a deadline that is still ahead', () => {
    // Math.ceil is deliberate: a deadline one hour out must read "1 day left"
    // or "0 days left", never "-1 days left". A user acting on a countdown is
    // trusting the sign.
    expect(daysUntil('2030-06-01T13:00:00.000Z', reference)).toBeGreaterThanOrEqual(0)
    expect(daysUntil('2030-06-01T23:59:59.000Z', reference)).toBe(1)
  })

  it('is positive in the future and negative once it is a full day past', () => {
    expect(daysUntil('2030-06-05T12:00:00.000Z', reference)).toBe(4)
    expect(daysUntil('2030-05-28T12:00:00.000Z', reference)).toBe(-4)
  })

  it('is null when there is no deadline, so the UI can hide the countdown', () => {
    expect(daysUntil(null, reference)).toBeNull()
    expect(daysUntil('nonsense', reference)).toBeNull()
  })
})

describe('relativeTime', () => {
  const reference = new Date('2030-06-01T12:00:00.000Z')

  it('labels the recent past in minutes and hours', () => {
    expect(relativeTime('2030-06-01T11:00:00.000Z', reference)).toMatch(/hour/i)
    expect(relativeTime('2030-06-01T11:55:00.000Z', reference)).toMatch(/minute/i)
  })

  it('labels the future as future, not as an elapsed duration', () => {
    // "in 3 hours" is correct; the bug this guards against is rendering a
    // future sync timestamp as if it had already happened.
    expect(relativeTime('2030-06-01T15:00:00.000Z', reference)).toBe('in 3 hours')
    expect(relativeTime('2020-01-01T12:00:00.000Z', reference)).toMatch(/ago|years/i)
  })

  it('returns null for nullish input so the UI can hide the element', () => {
    expect(relativeTime(null, reference)).toBeNull()
  })
})

describe('formatDate', () => {
  it('formats an ISO date deterministically in UTC', () => {
    expect(formatDate('2030-03-04T05:06:07.000Z')).toBe('Mar 4, 2030')
  })

  it('returns null rather than "Invalid Date" so the caller chooses the fallback', () => {
    expect(formatDate(null)).toBeNull()
    expect(formatDate('nonsense')).toBeNull()
  })
})

describe('formatDateRange', () => {
  it('collapses a single-day event', () => {
    expect(formatDateRange('2030-06-01T00:00:00Z', '2030-06-01T23:00:00Z')).toBe('Jun 1, 2030')
  })

  it('shows a range when start and end differ, repeating the year only when needed', () => {
    expect(formatDateRange('2030-06-01T00:00:00Z', '2030-06-03T23:00:00Z')).toBe('Jun 1, 2030 – Jun 3')
    expect(formatDateRange('2030-12-28T00:00:00Z', '2031-01-03T23:00:00Z')).toBe(
      'Dec 28, 2030 – Jan 3, 2031',
    )
  })

  it('shows only the published start when the end date is unknown', () => {
    // The contract is "never invent an end date", not "always render a range".
    expect(formatDateRange('2030-06-01T00:00:00Z', null)).toBe('Jun 1, 2030')
  })

  it('falls back to the end date when the start is unknown', () => {
    expect(formatDateRange(null, '2030-06-03T23:00:00Z')).toBe('Jun 3, 2030')
  })

  it('returns null when neither date is known', () => {
    expect(formatDateRange(null, null)).toBeNull()
  })
})