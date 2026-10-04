import { fetchJson } from '../lib/httpClient.js'
import { parseSourceDate } from '../lib/dates.js'
import {
  clampString,
  cleanTagList,
  hasDescriptiveProse,
  htmlToText,
  isProseLine,
  safeUrl,
  stripTags,
  toNumber,
  truncate,
} from '../lib/text.js'
import { detectCountry, normaliseFormat } from '../pipeline/classify.js'

/**
 * Unstop — public opportunity search API.
 *
 * Endpoint: GET https://unstop.com/api/public/opportunity/search-result?opportunity=hackathons&oppstatus=open&page=N
 *
 * robots.txt explicitly contains `Allow: /api/public/*`, so this path is
 * sanctioned for automated access. The payload is the same JSON the public
 * hackathon listing renders in the browser. No auth, CAPTCHA or paywall is
 * bypassed.
 */

const BASE = 'https://unstop.com/api/public/opportunity/search-result'
const PER_PAGE = 10

const PUBLIC_URL = 'https://unstop.com/'

function parseEligibility(raw) {
  if (!raw) return null
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    const parts = []
    const sector = parsed?.sector ?? []
    if (Array.isArray(sector) && sector.length) {
      parts.push(`Eligible sectors: ${sector.map(titleCaseWord).join(', ')}`)
    }
    const engineering = parsed?.engineering
    if (Array.isArray(engineering) && engineering.length) {
      const branches = engineering
        .map((e) => {
          const course = e?.course ? titleCaseWord(e.course) : null
          const years = Array.isArray(e?.passoutYear) ? e.passoutYear.join(', ') : null
          return [course, years && years !== 'all' ? `passing out ${years}` : null]
            .filter(Boolean)
            .join(', ')
        })
        .filter(Boolean)
      if (branches.length) parts.push(`Eligible courses: ${branches.join('; ')}`)
    }
    const year = parsed?.year
    if (year) parts.push(`Passing year: ${year}`)
    const age = parsed?.age
    if (age) parts.push(`Age criteria: ${JSON.stringify(age)}`)
    return parts.length ? parts.join('\n') : null
  } catch {
    return null
  }
}

/**
 * Map Unstop's audience facets onto HackRadar's eligibility levels.
 *
 * An event restricted to final-year postgraduates is genuinely harder to enter
 * than one open to fresher students, and the audience facets say so explicitly.
 * Returns null when the audience says nothing about seniority, so a filter never
 * excludes an event on a guess.
 */
export function eligibilityLevelFromAudience(audience) {
  if (!audience?.length) return null
  const text = audience.join(' ').toLowerCase()

  // "Open to All", "Anyone", "No Restriction" — the organiser states there is no
  // gate, which is the only thing that justifies calling an event open.
  if (/\b(all|anyone|everyone|no restriction|open to all)\b/.test(text)) return 'open'

  const hasExperienced = /\b(experienced|working|professional)s?\b/.test(text)
  const hasStudentLevel =
    /\b(student|undergraduate|postgraduate|graduate|fresher|freshers|first[- ]year|school|college)\b/.test(text)

  // Unstop renders the audience as a *menu* of options the organiser ticked, not
  // as a restriction. A list holding both working professionals and students says
  // entrants are welcome; it does not say they are beginners, so it levels to
  // nothing rather than guessing.
  if (hasExperienced) return hasStudentLevel ? null : 'advanced'

  if (/\b(fresher|freshers|first[- ]year)\b/.test(text)) return 'beginner'
  return null
}

function titleCaseWord(value) {
  return String(value)
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function totalPrize(prizes) {
  if (!Array.isArray(prizes) || !prizes.length) return { prizePool: null, currency: null }
  let sum = 0
  let currency = null
  for (const prize of prizes) {
    const cash = toNumber(prize?.cash ?? prize?.max_cash)
    if (cash) {
      sum += cash
      currency = currency ?? prize.currencyCode ?? prize.currency ?? null
    }
  }
  return { prizePool: sum > 0 ? sum : null, currency }
}

export const unstop = {
  name: 'unstop',
  label: 'Unstop',
  homepage: 'https://unstop.com/hackathons',
  termsUrl: 'https://unstop.com/terms',
  docsUrl: 'https://unstop.com/hackathons',
  integration: 'public-api',
  note: 'robots.txt declares `Allow: /api/public/*`. Only publicly listed, registration-open hackathons are read.',

  enabled: () => true,

  async fetchAll({ limit = 80, log } = {}) {
    const records = []
    const maxPages = Math.max(1, Math.ceil(limit / PER_PAGE))

    for (let page = 1; page <= maxPages; page += 1) {
      const url = `${BASE}?opportunity=hackathons&oppstatus=open&page=${page}&per_page=${PER_PAGE}`
      let payload
      try {
        payload = await fetchJson(url)
      } catch (err) {
        log?.warn(`Unstop page ${page} failed`, err.message)
        break
      }

      const rows = payload?.data?.data
      if (!Array.isArray(rows) || rows.length === 0) break

      for (const row of rows) {
        const record = normalise(row)
        if (record) records.push(record)
      }

      if (records.length >= limit) break
      const lastPage = Number(payload?.data?.last_page ?? 0)
      if (lastPage && page >= lastPage) break
    }

    log?.info(`Unstop: ${records.length} events`)
    return records
  },
}

/**
 * Unstop's `required_skills` entries are objects keyed `skill_name`, not the
 * `name`/`title`/`label` shape `cleanTagList` understands. Passing them through
 * unchanged silently produced an empty technology list for every Unstop event.
 * Unstop also flags these skills as AI-generated in `pivot.ai_generated`; they
 * are still what the organiser's own listing displays, so they are kept — but
 * they are the source's inference, not a published requirement, which is why
 * they are not treated as eligibility.
 */
export function skillNames(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((s) => (typeof s === 'string' ? s : s?.skill_name ?? s?.skill ?? s?.name ?? null))
    .filter(Boolean)
}

/**
 * Unstop's `filters` are *audience* facets — "Engineering Students",
 * "Postgraduate", "Fresher" — not event themes. Treating them as themes made
 * every Indian event classify as if it had published "Management" and "Law" as
 * its subject matter, which is both wrong and invisible in the UI. They belong
 * in eligibility, where they are genuinely useful.
 */
export function audienceFilters(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((f) => f?.type === 'eligible')
    .map((f) => (typeof f === 'string' ? f : f?.name ?? null))
    .filter(Boolean)
}

/** Unstop publishes no dedicated themes field, so it contributes none. */
function themesFromRow() {
  return []
}

/**
 * Build a card-sized summary.
 *
 * Unstop descriptions are organiser-authored HTML that reliably opens with a
 * section heading ("About the Event:", "Guidelines:") and then often spends most
 * of its length on eligibility bullets. Truncating that raw produces summaries
 * that read as a form, not a sentence, so the leading heading is dropped and the
 * first real prose paragraph is preferred.
 */
export function summarise(description) {
  if (!description) return null

  // Some Unstop listings publish *only* rules and evaluation criteria, with no
  // descriptive paragraph at all. Slicing that into a card summary produces
  // "Guidelines: • Eligibility: Open to all undergraduate…", which is worse
  // than saying nothing. A null summary makes the card state the truth instead.
  if (!hasDescriptiveProse(description)) return null

  const lines = description.split('\n').map((l) => l.trim())
  const prose = []
  for (const line of lines) {
    if (!line) {
      if (prose.length) break
      continue
    }
    if (isScaffolding(line)) continue
    prose.push(line)
    if (prose.join(' ').length > 320) break
  }

  const text = (prose.join(' ')).replace(/\s+/g, ' ').trim()
  if (!text) return null
  // A handful of listings open with a line that is just the event name again
  // ("Craft N Code – West Bengal State Qualifier"). Repeating the title as the
  // blurb tells the reader nothing, so it counts as no summary.
  if (text.split(/\s+/).length < 10) return null
  return truncate(text, 240) || null
}

/**
 * Structural noise that never makes a good card summary.
 *
 * Two shapes, both seen in real Unstop descriptions:
 *  - a bare section heading: "Guidelines:", "Round 1: Drone Soccer Arena Showdown:"
 *  - a bulleted rules item: "• Team size: 1–4 members per team."
 *
 * A heading may contain one internal colon, which is why this is a check on
 * "ends with a colon, and is short" rather than a single anchored pattern.
 */
export function isScaffolding(line) {
  if (/^[•*\-–—]\s/.test(line)) return true
  if (/:$/.test(line) && line.split(/\s+/).length <= 8) return true
  // "Eligibility: Open to all undergraduate and postgraduate students." is a
  // label followed by a sentence, not a description.
  //
  // The word bound is what makes this safe. Real labels are one to four words —
  // "Eligibility", "Team Formation", "Submission Rules". Prose that merely
  // contains a colon runs longer: "Techkriti'27 presents Code N Compete: a
  // high-intensity competitive programming challenge". Bound by characters
  // alone, the pattern swallowed that sentence and dropped good descriptions.
  if (/^[\w\s&'()-]{2,32}:/.test(line) && line.split(/\s+/).length <= 5 && /[.!?)”"']$/.test(line)) {
    return true
  }
  // A short line is a title, a tag or a fragment, never a summary.
  if (!isProseLine(line) || line.split(/\s+/).length < 10) return true
  return false
}

function normalise(row) {
  if (!row?.title) return null

  const description = htmlToText(row.details ?? '', { maxLength: 6000 })
  const summary = summarise(description)
  const organisation = row.organisation ?? {}
  const organiserName =
    organisation.organisation_name || organisation.name || organisation.title || 'Unstop host'
  const organiserLogo =
    normaliseUrl(row.logoUrl2) ?? normaliseUrl(row.thumb) ?? normaliseUrl(organisation.logo) ?? null

  const { prizePool, currency } = totalPrize(row.prizes)
  const requirements = row.regnRequirements ?? {}
  const deadline = parseSourceDate(requirements.end_regn_dt)
  const endDate = parseSourceDate(row.end_date)

  const address = row.address_with_country_logo ?? {}
  const location = [address.city, address.state, address.country].filter(Boolean).join(', ') || null

  const themes = themesFromRow(row)
  const audience = audienceFilters(row.filters)
  const structuredEligibility = parseEligibility(requirements.eligibility)
  const eligibility = [structuredEligibility, audience.length ? `Eligible audience: ${audience.join(', ')}` : null]
    .filter(Boolean)
    .join('\n') || null

  const teamSize =
    requirements.min_team_size || requirements.max_team_size
      ? `${requirements.min_team_size ?? 1}–${requirements.max_team_size ?? '?'} members`
      : null

  // Unstop publishes a real tri-state fee flag: `isPaid` is a boolean on every
  // row, not a field that is sometimes absent. Coercing it with `=== true`
  // would turn a missing flag into "free", so the tri-state is preserved here
  // and `isFree` is only asserted when the source actually said so.
  const feeFlag = typeof row.isPaid === 'boolean' ? row.isPaid : null
  const status = (row.status ?? '').toUpperCase()

  return {
    sourceName: 'unstop',
    sourceEventId: String(row.id),
    title: stripTags(row.title),
    slug: null,
    description: description || null,
    // A null summary is correct here: the card then says the organiser
    // published no description, instead of showing a rules list.
    summary,
    organizer: stripTags(organiserName),
    bannerUrl: organiserLogo,
    officialUrl: safeUrl(PUBLIC_URL + (row.public_url ?? '')),
    registrationUrl: safeUrl(`${PUBLIC_URL}${row.public_url ?? ''}?apply=true`),
    sourceUrl: safeUrl(PUBLIC_URL + (row.public_url ?? '')),
    themes,
    technologies: cleanTagList(skillNames(row.required_skills), { max: 10, maxLength: 32 }),
    startDate: parseSourceDate(requirements.start_regn_dt) ?? endDate,
    endDate,
    registrationDeadline: deadline,
    eventFormat: normaliseFormat({ region: row.region, location }),
    location,
    country: detectCountry({ address: row.address_with_country_logo?.country, location }),
    prizePool,
    currency,
    eligibility,
    eligibilityLevel: eligibilityLevelFromAudience(audience),
    teamSize,
    judgingCriteria: null,
    resources: [],
    faq: [],
    status: status === 'LIVE' ? 'active' : 'upcoming',
    isPaid: feeFlag,
    isFree: feeFlag === true ? false : feeFlag === false ? true : null,
    featured: false,
    registrationOpen: row.regn_open === 1 || row.regn_open === true,
    participantCount: toNumber(row.registerCount),
    sourcePublishedAt: parseSourceDate(row.approved_date),
    viewsCount: toNumber(row.viewsCount),
  }
}

function normaliseUrl(value) {
  if (!value) return null
  const raw = String(value).trim()
  if (!raw || !/^https?:|^\/\//i.test(raw)) return null
  return safeUrl(raw.startsWith('//') ? `https:${raw}` : raw)
}

export { clampString }
