import { fetchJson, fetchText } from '../lib/httpClient.js'
import { parseSourceDate, parseRelativeDeadline, now } from '../lib/dates.js'
import {
  cleanTagList, decodeEntities, htmlToText, normaliseImageUrl, safeUrl, stripTags, toNumber, truncate,
} from '../lib/text.js'
import { normaliseFormat } from '../pipeline/classify.js'

/**
 * Devpost — public JSON listing endpoint.
 *
 * Endpoint:  GET https://devpost.com/api/hackathons?status[]=open&status[]=upcoming&page=N
 * Detail:     GET https://<hackathon-subdomain>/ -> schema.org/Event JSON-LD
 *
 * robots.txt for devpost.com is `User-agent: * / Disallow:` (empty), i.e. all
 * paths are permitted for crawlers. This is the same JSON the public
 * /hackathons listing page consumes in the browser — no authentication, no
 * CAPTCHA and no paywall is bypassed.
 *
 * Detail pages are fetched lazily (only when a user opens one, plus a small
 * background enrichment budget) because 170+ detail pages per run would be
 * needlessly aggressive.
 */

const LIST_BASE = 'https://devpost.com/api/hackathons'
const PER_PAGE = 9

function parsePrize(raw) {
  if (!raw) return { prizePool: null, currency: null }
  const text = stripTags(decodeEntities(String(raw)))
  const symbolMatch = text.match(/([$€£¥₹])\s*([\d,.]+)/)
  const plainMatch = text.match(/([\d,.]+)\s*(USD|EUR|GBP|INR|CAD|AUD|JPY|CNY|SGD|AED|CHF)?/i)
  if (!symbolMatch && !plainMatch) return { prizePool: null, currency: null }

  const symbol = symbolMatch?.[1] ?? null
  const amountText = symbolMatch?.[2] ?? plainMatch?.[1]
  const amount = toNumber(amountText)
  // `amount === null` rather than `!amount`: a published "$0 in prizes" is the
  // organiser stating there is no prize, which is a real answer. Collapsing it
  // to null would make it indistinguishable from a field nobody filled in, and
  // the two mean opposite things to anyone reading the card.
  if (amount === null || !Number.isFinite(amount)) return { prizePool: null, currency: null }

  const codeFromPlain = plainMatch?.[2]?.toUpperCase() ?? null
  const currency = codeFromPlain ?? { $: 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR' }[symbol] ?? null
  return { prizePool: amount, currency }
}

/**
 * Pull a labelled text block out of a Devpost detail page.
 *
 * Devpost is inconsistent: some event pages title the block "Overview", others
 * "About the challenge", and some have only an `id="resources"` anchor with no
 * heading at all. Both shapes are tried, heading-first then id-based.
 */
function extractSection(html, headingPattern, idPattern = null) {
  const headingRe = new RegExp(
    `<(h[1-6])[^>]*>\\s*(?:<[^>]+>\\s*)*${headingPattern}[^<]*</\\1>([\\s\\S]{0,6000}?)(?=<h[1-6]|</section|<footer)`,
    'i',
  )
  const byHeading = html.match(headingRe)
  if (byHeading) {
    const text = htmlToText(byHeading[2], { maxLength: 1200 })
    if (text) return text
  }

  if (idPattern) {
    const byId = html.match(
      new RegExp(`id=["']${idPattern}["'][^>]*>([\\s\\S]{0,6000}?)(?=<h[1-6]|</section|<footer)`, 'i'),
    )
    if (byId) {
      const text = htmlToText(byId[1], { maxLength: 1200 })
      if (text) return text
    }
  }

  return null
}

export const devpost = {
  name: 'devpost',
  label: 'Devpost',
  homepage: 'https://devpost.com/',
  termsUrl: 'https://devpost.com/terms',
  docsUrl: 'https://devpost.com/hackathons',
  integration: 'public-api',
  note: 'Public JSON listing endpoint plus schema.org/Event structured data on each event page. Per robots.txt all paths are crawlable.',

  enabled: () => true,

  async fetchAll({ limit = 60, log } = {}) {
    const reference = now()
    const records = []
    const maxPages = Math.max(1, Math.ceil(limit / PER_PAGE))

    for (let page = 1; page <= maxPages; page += 1) {
      const url = `${LIST_BASE}?status[]=open&status[]=upcoming&page=${page}`
      let payload
      try {
        payload = await fetchJson(url, { headers: { 'x-requested-with': 'XMLHttpRequest' } })
      } catch (err) {
        log?.warn(`Devpost page ${page} failed`, err.message)
        break
      }

      const rows = payload?.hackathons ?? []
      if (!Array.isArray(rows) || rows.length === 0) break

      for (const row of rows) {
        const record = normalise(row, reference)
        if (record) records.push(record)
      }

      const total = Number(payload?.meta?.total_count ?? 0)
      if (page * PER_PAGE >= total) break
      if (records.length >= limit) break
    }

    log?.info(`Devpost: ${records.length} events`)
    return records
  },

  /** Lazy detail enrichment via JSON-LD on the organiser's Devpost subdomain. */
  async fetchDetail(record) {
    const url = record.officialUrl
    if (!url) return null
    try {
      const html = await fetchText(url, { retries: 1 })
      return parseDetail(html, record)
    } catch {
      // A failed detail fetch is not an error: the list record is already
      // stored and the orchestrator will retry this event on the next run.
      return null
    }
  },
}

function normalise(row, reference) {
  if (!row?.title) return null

  const location = row.displayed_location?.location ?? null
  const period = row.submission_period_dates ?? null

  // The period is a single range string such as "Aug 31 - Oct 23, 2026" or
  // "Oct 03 - 10, 2026", and `parseSourceDate` understands both shapes whole.
  //
  // Splitting on "-" and parsing the halves separately is what put a 2001 start
  // date on 62 real events: the left half of "Aug 31 - Oct 23, 2026" is
  // "Aug 31 ", which carries no year, so the year-less branch guessed 2001. The
  // right half kept its year only by accident, because everything after the
  // first dash still contained it. Passing the string intact gets both ends
  // right and removes the guesswork entirely.
  const startDate = parseSourceDate(period, { timeZone: 'UTC' })
  const endDate = period ? parseSourceDate(period, { timeZone: 'UTC', endOfDay: true }) : null

  const { prizePool, currency } = parsePrize(row.prize_amount)
  const thumbnail = normaliseImageUrl(row.thumbnail_url)
  const officialUrl = safeUrl(row.url)
  const registrationUrl =
    safeUrl(row.start_a_submission_url) ??
    (officialUrl ? `${officialUrl.replace(/\/$/, '')}/register` : null)

  return {
    sourceName: 'devpost',
    sourceEventId: String(row.id),
    title: stripTags(decodeEntities(row.title)),
    slug: null, // assigned by the normalizer once the source is known
    description: null,
    summary: null,
    organizer: row.organization_name ? stripTags(row.organization_name) : 'Devpost',
    bannerUrl: thumbnail,
    officialUrl,
    registrationUrl,
    sourceUrl: officialUrl,
    themes: cleanTagList(row.themes ?? [], { max: 8, maxLength: 44 }),
    technologies: [],
    startDate,
    endDate,
    registrationDeadline: parseRelativeDeadline(row.time_left_to_submission, reference),
    eventFormat: normaliseFormat({ location }),
    location: /online/i.test(location ?? '') ? 'Online' : location,
    country: null,
    prizePool,
    currency,
    eligibility: row.invite_only
      ? row.eligibility_requirement_invite_only_description ?? 'Invite only'
      : null,
    eligibilityLevel: null,
    teamSize: null,
    judgingCriteria: null,
    resources: [],
    faq: [],
    status: row.open_state === 'open' ? 'active' : 'upcoming',
    isPaid: null,
    isFree: null,
    featured: Boolean(row.featured),
    registrationOpen: row.open_state === 'open',
    participantCount: toNumber(row.registrations_count),
    winnersAnnounced: Boolean(row.winners_announced),
    sourcePublishedAt: null,
  }
}

function parseDetail(html, record) {
  const ldMatch = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/i)
  let event = null
  if (ldMatch) {
    try {
      const parsed = JSON.parse(ldMatch[1].trim())
      event = Array.isArray(parsed) ? parsed.find((p) => p['@type'] === 'Event') : parsed
    } catch {
      event = null
    }
  }

  // JSON-LD is the most reliable source of a real description, so it wins when
  // present and non-trivial. The HTML sections are the fallback.
  const ldDescription = event?.description
    ? htmlToText(decodeEntities(String(event.description)), { maxLength: 6000 })
    : null

  const htmlDescription =
    extractSection(html, 'About\\s+(?:the\\s+)?(?:challenge|event|hackathon)', 'challenge') ??
    extractSection(html, 'Overview', 'overview') ??
    extractSection(html, 'The\\s+Challenge', 'challenge')

  const description =
    ldDescription && ldDescription.length >= 200 ? ldDescription : htmlDescription ?? ldDescription

  const judging = extractSection(html, 'Judging\\s*(?:Criteria)?', 'judging-criteria')
  const prizes = extractSection(html, 'Prizes', 'prizes')
  const resources = extractSection(html, 'Resources', 'resources')
  const submission = extractSection(
    html,
    'Submission\\s*(?:Period|Requirements|Guidelines)',
    'submission',
  )
  const whoCan = extractSection(html, 'Who can participate|Eligibility', 'who-can-participate')
  const faqText = extractSection(html, '(?:Frequently Asked(?: Questions)?|FAQ)', 'faq')

  // Devpost renders the organiser's real eligibility rules as a real list
  // inside `#eligibility-list`. Taking the items verbatim preserves the
  // organiser's own wording instead of our paraphrasing them.
  const eligibilityList = [...html.matchAll(/<ul[^>]*id="eligibility-list"[^>]*>([\s\S]*?)<\/ul>/gi)]
    .flatMap((m) => [...m[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)])
    .map((m) => stripTags(decodeEntities(m[1])).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 12)

  const faq = []
  if (faqText) {
    const questions = faqText.split(/\n/).filter((line) => line.trim().endsWith('?'))
    faq.push(...questions.slice(0, 8).map((q) => ({ question: q.trim(), answer: '' })))
  }

  const patch = {}
  if (description) {
    patch.description = description
    patch.summary = truncate(description, 240)
  }
  if (judging) patch.judgingCriteria = judging
  if (resources) patch.resources = [resources]
  if (prizes && record.prizePool === null) {
    const parsed = parsePrize(prizes)
    if (parsed.prizePool) {
      patch.prizePool = parsed.prizePool
      patch.currency = parsed.currency
    }
  }
  if (faq.length) patch.faq = faq

  // Eligibility: the organiser's own rule list wins, then the prose section,
  // then the submission guidelines (which describe process, not eligibility).
  if (eligibilityList.length) {
    patch.eligibility = eligibilityList.map((rule) => `- ${rule}`).join('\n')
  } else {
    const eligibility = whoCan ?? (submission && !record.eligibility ? submission : null)
    if (eligibility) patch.eligibility = eligibility
  }

  const ldDates = {
    startDate: parseSourceDate(event?.startDate, { timeZone: 'UTC' }),
    endDate: parseSourceDate(event?.endDate, { timeZone: 'UTC', endOfDay: true }),
  }
  if (ldDates.startDate) patch.startDate = ldDates.startDate
  if (ldDates.endDate) patch.endDate = ldDates.endDate

  const ldLocation = event?.location?.address?.addressLocality
    || event?.location?.address?.name
    || null
  if (ldLocation && ldLocation !== 'Online' && !record.location) patch.location = stripTags(ldLocation)

  return patch
}

export {
  parsePrize as parseDevpostPrize,
  normalise as normaliseDevpostRow,
  PER_PAGE as DEVPOST_PER_PAGE,
}
