import { fetchJson } from '../lib/httpClient.js'
import { parseSourceDate, daysUntil } from '../lib/dates.js'
import { cleanTagList, safeUrl, stripTags, toNumber, truncate } from '../lib/text.js'
import { normaliseFormat } from '../pipeline/classify.js'

/**
 * Kaggle competitions — OPTIONAL, credential-gated.
 *
 * Kaggle's REST API requires OAuth. `GET https://www.kaggle.com/api/v1/competitions/list`
 * returns 401 without credentials, so this source is disabled by default and
 * only activates once KAGGLE_USERNAME and KAGGLE_KEY are set.
 *
 * These are competitions rather than classic 24-hour hackathons, so they are
 * clearly labelled in the UI (HackRadar treats "competition" as a hackathon
 * format and marks `competitionType`).
 *
 * Authentication uses HTTP Basic over the same official endpoint — no
 * circumvention, and it is the mechanism Kaggle documents for API keys.
 */

const ENDPOINT = 'https://www.kaggle.com/api/v1/competitions/list'

function credentials() {
  const username = process.env.KAGGLE_USERNAME
  const key = process.env.KAGGLE_KEY
  if (!username || !key) return null
  return Buffer.from(`${username}:${key}`).toString('base64')
}

export const kaggle = {
  name: 'kaggle',
  label: 'Kaggle Competitions',
  homepage: 'https://www.kaggle.com/competitions',
  termsUrl: 'https://www.kaggle.com/terms',
  docsUrl: 'https://www.kaggle.com/docs/api',
  integration: 'optional-credentials',
  note: 'Requires a Kaggle API key (KAGGLE_USERNAME / KAGGLE_KEY). Disabled without credentials.',

  enabled: () => Boolean(credentials()),

  async fetchAll({ log } = {}) {
    const auth = credentials()
    if (!auth) {
      log?.info('Kaggle: disabled (no credentials)')
      return []
    }

    const reference = new Date()
    const records = []

    // 3 pages x 20, sorted by deadline so the nearest-deadline competitions
    // (the ones users can still act on) are always captured.
    for (let page = 1; page <= 3; page += 1) {
      let rows
      try {
        rows = await fetchJson(`${ENDPOINT}?page=${page}&sortBy=deadline&group=general&pageSize=20`, {
          headers: { authorization: `Basic ${auth}` },
          retries: 1,
        })
      } catch (err) {
        log?.warn(`Kaggle page ${page} failed`, err.message)
        break
      }
      if (!Array.isArray(rows) || !rows.length) break

      for (const row of rows) {
        const record = normalise(row, reference)
        if (record) records.push(record)
      }
    }

    log?.info(`Kaggle: ${records.length} competitions`)
    return records
  },
}

function normalise(row, reference) {
  if (!row?.ref || !row?.title) return null

  const deadlineRaw = row.deadline ?? row.submissionDeadline ?? null
  const deadline = parseSourceDate(deadlineRaw)
  // Only surface competitions a user could still submit to.
  if (deadline && daysUntil(deadline, reference) < 0) return null

  const url = safeUrl(`https://www.kaggle.com/competitions/${row.ref}`)
  const description = stripTags(row.description ?? '')

  return {
    sourceName: 'kaggle',
    sourceEventId: String(row.ref),
    title: stripTags(row.title),
    slug: null,
    description: description || null,
    summary: truncate(description || stripTags(row.subtitle ?? ''), 240),
    organizer: 'Kaggle',
    bannerUrl: row.imageUrl ? safeUrl(row.imageUrl) : null,
    officialUrl: url,
    registrationUrl: url,
    sourceUrl: url,
    themes: cleanTagList([row.categoryDescription ?? row.subtitle], { max: 4, maxLength: 44 }),
    technologies: [],
    // Kaggle exposes an end date, not a start date.
    startDate: null,
    endDate: deadline,
    registrationDeadline: deadline,
    eventFormat: normaliseFormat({ isOnline: true }),
    location: 'Online',
    country: null,
    prizePool: toNumber(row.rewardQuantity),
    currency: toNumber(row.rewardQuantity) ? 'USD' : null,
    eligibility: row.subtitle ? stripTags(row.subtitle) : null,
    eligibilityLevel: null,
    teamSize: row.teamName ? null : 'Solo or team',
    judgingCriteria: null,
    resources: [],
    faq: [],
    status: 'upcoming',
    isPaid: false,
    isFree: true,
    featured: false,
    registrationOpen: true,
    participantCount: toNumber(row.teamCount ?? row.userRank) ?? null,
    sourcePublishedAt: null,
    competitionType: 'competition',
  }
}
