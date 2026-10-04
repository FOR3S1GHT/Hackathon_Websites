/**
 * Date parsing / formatting for heterogeneous data sources.
 *
 * Sources hand us every shape imaginable:
 *   Devpost  -> "Aug 31 - Oct 23, 2026", "22 days left"
 *   Unstop   -> "2025-02-08T09:00:00+05:30"
 *   Devfolio -> "2027-01-22T12:30:00.000Z"  (with a separate IANA timezone field)
 *   HackerEarth -> "2026-08-17 00:00:00+05:30"
 *
 * Everything is normalised to a UTC ISO-8601 string so sorting/comparison in
 * SQL and in JS is trivial and always correct.
 */

const MONTHS = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
}

/** Current time, overridable in tests. */
export function now() {
  return new Date()
}

export function toIso(value) {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

export function isValidDate(value) {
  if (!value) return false
  const d = value instanceof Date ? value : new Date(value)
  return !Number.isNaN(d.getTime())
}

/**
 * Wall-clock time in `timeZone`, expressed as "YYYY-MM-DDTHH:mm:ssZ".
 * `null` means the wall clock time did not exist in that zone (DST spring-forward gap).
 */
function wallClockToUtc(parts, timeZone) {
  const guess = Date.UTC(parts.year, parts.month, parts.day, parts.hour ?? 0, parts.minute ?? 0, parts.second ?? 0)
  if (!timeZone) return new Date(guess)

  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    let offset = 0
    for (let i = 0; i < 3; i += 1) {
      const partsOf = dtf.formatToParts(new Date(guess - offset))
      const map = {}
      for (const p of partsOf) map[p.type] = p.value
      const asUtc = Date.UTC(
        Number(map.year),
        Number(map.month) - 1,
        Number(map.day),
        Number(map.hour) % 24,
        Number(map.minute),
        Number(map.second),
      )
      const nextOffset = asUtc - guess
      if (nextOffset === offset) break
      offset = nextOffset
    }
    return new Date(guess - offset)
  } catch {
    return new Date(guess)
  }
}

function extractDateParts(input) {
  const text = String(input).trim()
  if (!text) return null

  // 2026-08-17 00:00:00+05:30 / 2026-08-17T12:30:00.000Z
  const isoish = text.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?$/i,
  )
  if (isoish) {
    const [, y, mo, d, h = '0', mi = '0', s = '0', zone] = isoish
    const parts = { year: +y, month: +mo - 1, day: +d, hour: +h, minute: +mi, second: +s }
    if (zone) {
      return { parts, timeZone: null, hasExplicitZone: true, offset: parseOffset(zone) }
    }
    return { parts, timeZone: null, hasExplicitZone: false, offset: null }
  }

  // "Aug 31, 2026" / "31 Aug 2026" / "August 31 - Oct 23, 2026" (returns a range)
  const range = text.match(
    /^([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*(?:-|–|—|to)\s*([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s*(\d{4})$/i,
  )
  if (range) {
    const [, m1, d1, m2, d2, y] = range
    const startMonth = monthIndex(m1)
    const endMonth = monthIndex(m2)
    return {
      // Both ends take their own month. This previously computed the opening
      // month by comparing against the *closing* month name and falling back
      // when it missed, which only worked because the sources that reach here
      // abbreviate ("Aug 31 - Oct 23") while the comparison table holds full
      // names ("August"). A fully spelled range — "August 31 - October 23,
      // 2026" — matched, and the opening date silently became 31 October.
      //
      // Only one year is written, so a window that wraps the new year is read as
      // ending in the following one. "Dec 28 - Jan 04, 2027" is an event running
      // into January; taking both ends as 2027 would store an event that ends
      // eleven months before it begins, and every "ending soon" and "upcoming"
      // query would then be wrong about it.
      range: [
        { year: +y, month: startMonth, day: +d1 },
        { year: +y + (endMonth < startMonth ? 1 : 0), month: endMonth, day: +d2 },
      ],
      timeZone: null,
      hasExplicitZone: false,
      offset: null,
    }
  }

  // "Oct 03 - 10, 2026" (month only on the left, shared month/year)
  const shortRange = text.match(
    /^([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2}),?\s*(\d{4})$/i,
  )
  if (shortRange) {
    const [, m1, d1, d2, y] = shortRange
    const mi = monthIndex(m1)
    return {
      range: [
        { year: +y, month: mi, day: +d1 },
        { year: +y, month: mi, day: +d2 },
      ],
      timeZone: null,
      hasExplicitZone: false,
      offset: null,
    }
  }

  const single = text.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})$/i)
  if (single) {
    const [, m, d, y] = single
    return {
      parts: { year: +y, month: monthIndex(m), day: +d },
      timeZone: null,
      hasExplicitZone: false,
      offset: null,
    }
  }

  const dayFirst = text.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s*(\d{4})$/i)
  if (dayFirst) {
    const [, d, m, y] = dayFirst
    return {
      parts: { year: +y, month: monthIndex(m), day: +d },
      timeZone: null,
      hasExplicitZone: false,
      offset: null,
    }
  }

  // Numeric "31/08/2026" or "08/31/2026" — ambiguous, assume D/M/Y (most sources are non-US)
  const numeric = text.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/)
  if (numeric) {
    const [, a, b, y] = numeric
    return {
      parts: { year: +y, month: Math.min(+a, +b) - 1, day: Math.max(+a, +b) },
      timeZone: null,
      hasExplicitZone: false,
      offset: null,
    }
  }

  return null
}

function monthIndex(name) {
  const key = String(name).slice(0, 3).toLowerCase()
  return MONTHS[key] ?? 0
}

function parseOffset(zone) {
  if (!zone) return null
  if (zone.toUpperCase() === 'Z') return 0
  const m = zone.match(/^([+-])(\d{2}):?(\d{2})$/)
  if (!m) return null
  const [, sign, h, mi] = m
  const minutes = (+h * 60 + +mi) * (sign === '-' ? -1 : 1)
  return minutes * 60000
}

/**
 * Parse a date string into a UTC ISO string.
 * @param {string|Date|null} value
 * @param {{ timeZone?: string, endOfDay?: boolean }} [options]
 */
export function parseSourceDate(value, options = {}) {
  const { timeZone, endOfDay = false } = options
  if (!value) return null
  if (value instanceof Date) return toIso(value)

  // Bare epoch numbers (seconds or milliseconds). JSON APIs hand these out
  // often enough that dropping them would lose real dates. The two scales are
  // told apart at ~Sep 2001, which is the only unambiguous cut-off: any
  // plausible event date is comfortably above 1e11 ms and below 1e11 s.
  if (typeof value === 'number' && Number.isFinite(value)) {
    const epoch = new Date(value < 1e11 ? value * 1000 : value)
    return Number.isNaN(epoch.getTime()) ? null : toIso(epoch)
  }

  const text = String(value).trim()
  if (!text || /^(tbd|tba|n\/a|null|undefined|-|not (?:yet )?(?:specified|announced))$/i.test(text)) {
    return null
  }

  const parsed = extractDateParts(text)
  if (!parsed) {
    const fallback = new Date(text)
    return isValidDate(fallback) ? toIso(fallback) : null
  }

  if (parsed.range) {
    const [a, b] = parsed.range
    if (!Number.isFinite(a.month) || !Number.isFinite(b.month)) return null
    const start = wallClockToUtc({ ...a, hour: 0, minute: 0, second: 0 }, timeZone)
    const end = wallClockToUtc({ ...b, hour: 23, minute: 59, second: 59 }, timeZone)
    if (endOfDay) return toIso(end)
    return toIso(start)
  }

  const p = parsed.parts
  if (!Number.isFinite(p.month) || p.month < 0 || p.month > 11) return null
  if (p.day < 1 || p.day > 31) return null

  if (parsed.hasExplicitZone && parsed.offset !== null) {
    const ms = Date.UTC(p.year, p.month, p.day, p.hour, p.minute, p.second) - parsed.offset
    return toIso(new Date(ms))
  }

  if (endOfDay) {
    return toIso(wallClockToUtc({ ...p, hour: 23, minute: 59, second: 59 }, timeZone))
  }
  return toIso(wallClockToUtc(p, timeZone))
}

/**
 * Parse a Devpost `time_left_to_submission` string ("22 days left",
 * "closes in 3 hours", "Last day") into an absolute UTC ISO string.
 */
export function parseRelativeDeadline(text, reference = now()) {
  if (!text) return null
  const value = String(text).trim().toLowerCase()
  if (/winner|ended|closed|submission closed/.test(value)) return null

  const unitMatch = value.match(
    /(\d+)\s*(second|minute|hour|day|week|month)s?/,
  )
  if (unitMatch) {
    const amount = Number(unitMatch[1])
    const unit = unitMatch[2]
    const ms = {
      second: 1000,
      minute: 60_000,
      hour: 3_600_000,
      day: 86_400_000,
      week: 604_800_000,
      month: 2_592_000_000,
    }[unit]
    return toIso(new Date(reference.getTime() + amount * ms))
  }

  if (/last day|today|closing today|ends today/.test(value)) {
    return toIso(new Date(reference.getTime() + 86_400_000))
  }
  if (/tomorrow|next day/.test(value)) {
    return toIso(new Date(reference.getTime() + 86_400_000))
  }
  return null
}

/** Days between now and an ISO string. Negative when already past. */
export function daysUntil(iso, reference = now()) {
  if (!iso) return null
  const target = new Date(iso)
  if (Number.isNaN(target.getTime())) return null
  return Math.ceil((target.getTime() - reference.getTime()) / 86_400_000)
}

/** "3 days ago" / "in 2 months" */
export function relativeTime(iso, reference = now()) {
  if (!iso) return null
  const target = new Date(iso)
  if (Number.isNaN(target.getTime())) return null
  const diffMs = target.getTime() - reference.getTime()
  const abs = Math.abs(diffMs)
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  const units = [
    ['year', 31_536_000_000],
    ['month', 2_592_000_000],
    ['week', 604_800_000],
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
  ]
  for (const [unit, ms] of units) {
    if (abs >= ms) return rtf.format(Math.round(diffMs / ms), unit)
  }
  return 'just now'
}

export function formatDate(iso, { withTime = false } = {}) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
    timeZone: 'UTC',
  }).format(d)
}

/** Human date range: "Aug 31 – Oct 23, 2026". */
export function formatDateRange(startIso, endIso) {
  const start = formatDate(startIso)
  const end = formatDate(endIso)
  if (!start) return end || null
  if (!end) return start
  const s = new Date(startIso)
  const e = new Date(endIso)
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return `${start} – ${end}`
  // Same calendar day: "Jun 1 – Jun 1" is noise, so collapse to one date.
  const sameDay =
    s.getUTCFullYear() === e.getUTCFullYear() &&
    s.getUTCMonth() === e.getUTCMonth() &&
    s.getUTCDate() === e.getUTCDate()
  if (sameDay) return start
  const sameYear = s.getUTCFullYear() === e.getUTCFullYear()
  const endFmt = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  }).format(e)
  return `${start} – ${endFmt}`
}
