import { fetchJson } from '../lib/httpClient.js'
import { parseSourceDate } from '../lib/dates.js'
import {
  cleanTagList, normaliseImageUrl, safeUrl, stripTags, toNumber, truncate,
} from '../lib/text.js'
import { normaliseFormat } from '../pipeline/classify.js'

/**
 * HackerEarth — public events endpoint used by their own site.
 *
 * Endpoint: GET https://www.hackerearth.com/chrome-extension/events/
 *
 * robots.txt is `Allow: /` with only locale and authenticated paths excluded,
 * and `/chrome-extension/events/` is not among them. The payload is the JSON
 * the public hackathon listing renders. The endpoint returns only the current
 * small set of live/upcoming events (no pagination parameter is honoured), so
 * this source contributes a handful of records per run — which is expected and
 * noted in the Data Sources page.
 */

const ENDPOINT = 'https://www.hackerearth.com/chrome-extension/events/'

export const hackerearth = {
  name: 'hackerearth',
  label: 'HackerEarth',
  homepage: 'https://www.hackerearth.com/challenges/',
  termsUrl: 'https://www.hackerearth.com/terms/',
  docsUrl: 'https://www.hackerearth.com/challenges/hackathon/',
  integration: 'public-endpoint',
  note: 'Public JSON events endpoint (robots.txt: Allow: /). Returns only currently listed live and upcoming events.',

  enabled: () => true,

  async fetchAll({ log } = {}) {
    let payload
    try {
      payload = await fetchJson(ENDPOINT)
    } catch (err) {
      log?.warn('HackerEarth fetch failed', err.message)
      return []
    }

    const rows = Array.isArray(payload?.response) ? payload.response : []
    const records = []
    for (const row of rows) {
      const record = normalise(row)
      if (record) records.push(record)
    }
    log?.info(`HackerEarth: ${records.length} events`)
    return records
  },
}

function normalise(row) {
  if (!row?.title || !row?.url) return null

  const url = safeUrl(row.url)
  const startDate = parseSourceDate(row.start_utc_tz ?? row.start_tz)
  const endDate = parseSourceDate(row.end_utc_tz ?? row.end_tz, { endOfDay: true })

  // HackerEarth's `description` is a one-line teaser; the full brief lives on
  // the event page. Store the teaser verbatim rather than fabricating detail.
  const description = stripTags(row.description ?? '')

  const organiser = row.college ? 'HackerEarth partner college' : 'HackerEarth'
  const isOngoing = String(row.status ?? '').toUpperCase() === 'ONGOING'

  return {
    sourceName: 'hackerearth',
    sourceEventId: String(row.url),
    title: stripTags(row.title),
    slug: null,
    description: description || null,
    summary: truncate(description || organiser, 240),
    organizer: organiser,
    bannerUrl: normaliseImageUrl(row.thumbnail),
    officialUrl: url,
    registrationUrl: safeUrl(row.subscribe) ?? url,
    sourceUrl: url,
    themes: cleanTagList(row.challenge_type ? [row.challenge_type] : [], { max: 4, maxLength: 40 }),
    technologies: [],
    startDate,
    endDate,
    // HackerEarth's listing has no separate registration deadline field.
    registrationDeadline: null,
    eventFormat: normaliseFormat({ location: null, isOnline: null }),
    location: null,
    country: 'India',
    prizePool: null,
    currency: null,
    eligibility: null,
    eligibilityLevel: null,
    teamSize: null,
    judgingCriteria: null,
    resources: [],
    faq: [],
    status: isOngoing ? 'active' : 'upcoming',
    isPaid: null,
    isFree: null,
    featured: false,
    registrationOpen: true,
    participantCount: null,
    sourcePublishedAt: null,
  }
}

export { toNumber }
