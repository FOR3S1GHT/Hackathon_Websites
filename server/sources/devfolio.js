import { fetchJson } from '../lib/httpClient.js'
import { parseSourceDate } from '../lib/dates.js'
import {
  cleanTagList, clampString, decodeEntities, normaliseImageUrl, safeUrl, stripTags, toNumber, truncate,
} from '../lib/text.js'
import { normaliseFormat } from '../pipeline/classify.js'

/**
 * Devfolio — public listing API.
 *
 * Endpoint: GET https://api.devfolio.co/api/hackathons?page=N
 *
 * robots.txt for both api.devfolio.co and devfolio.co is `Disallow:` (empty),
 * i.e. everything is permitted. The endpoint returns up to 1000 records per
 * page (~7 MB), which is why each page is trimmed down to the fields HackRadar
 * actually stores immediately after the fetch rather than being kept in memory.
 *
 * `desc` is Markdown, not HTML, so it is converted to plain text rather than
 * being rendered as markup.
 */

const BASE = 'https://api.devfolio.co/api/hackathons'

/** Keep only what we store — cuts the retained payload by ~95%. */
function trim(raw) {
  const setting = raw.hackathon_setting ?? {}
  return {
    uuid: raw.uuid,
    name: raw.name,
    slug: raw.slug,
    tagline: raw.tagline,
    desc: typeof raw.desc === 'string' ? raw.desc.slice(0, 40000) : null,
    starts_at: raw.starts_at,
    ends_at: raw.ends_at,
    timezone: raw.timezone,
    is_online: raw.is_online,
    status: raw.status,
    city: raw.city,
    state: raw.state,
    country: raw.country,
    location: raw.location,
    uri: raw.uri,
    cover_img: raw.cover_img,
    favicon: raw.favicon,
    team_min: raw.team_min,
    team_size: raw.team_size,
    apply_mode: raw.apply_mode,
    participants_count: raw.participants_count,
    featured: raw.featured,
    verified: raw.verified,
    type: raw.type,
    edition_name: raw.edition_name,
    is_university_hackathon: raw.is_university_hackathon,
    prizes: Array.isArray(raw.prizes) ? raw.prizes.slice(0, 5) : [],
    themes: Array.isArray(raw.themes) ? raw.themes.slice(0, 8) : [],
    setting: {
      site: setting.site,
      reg_starts_at: setting.reg_starts_at,
      reg_ends_at: setting.reg_ends_at,
      judging_factors: setting.judging_factors,
      contact_email: setting.contact_email,
      logo: setting.logo,
      primary_color: setting.primary_color,
      twitter: setting.twitter,
      linkedin: setting.linkedin,
      instagram: setting.instagram,
      discord: setting.discord,
      telegram: setting.telegram,
      coc_url: setting.coc_url,
      referral_prize_doc_link: setting.referral_prize_doc_link,
    },
  }
}

/** Markdown -> readable plain text (headings, emphasis, lists, code fences). */
export function markdownToText(md, { maxLength = 6000 } = {}) {
  if (!md) return ''
  let text = String(md)
  text = text.replace(/```[\s\S]*?```/g, ' ')
  text = text.replace(/`([^`]+)`/g, '$1')
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  text = text.replace(/^\s{0,3}#{1,6}\s+/gm, '')
  text = text.replace(/^\s{0,3}>\s?/gm, '')
  text = text.replace(/^\s*[-*+]\s+/gm, '• ')
  text = text.replace(/^\s*\d+\.\s+/gm, (m) => m.trim().replace('.', '. '))
  text = text.replace(/(\*\*|__)(.*?)\1/g, '$2')
  text = text.replace(/(\*|_)(.*?)\1/g, '$2')
  text = text.replace(/~~(.*?)~~/g, '$1')
  text = text.replace(/<br\s*\/?>/gi, '\n')
  text = text.replace(/<[^>]+>/g, ' ')
  text = decodeEntities(text)
  text = text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n')
  text = text.trim()
  return maxLength > 0 && text.length > maxLength ? text.slice(0, maxLength) : text
}

function totalPrize(prizes) {
  if (!Array.isArray(prizes) || !prizes.length) return { prizePool: null, currency: null }
  let sum = 0
  let currency = null
  for (const prize of prizes) {
    const amount = toNumber(prize?.amount ?? prize?.value ?? prize?.prize_amount)
    if (amount) {
      sum += amount
      currency = currency ?? prize?.currency ?? prize?.currency_code ?? 'INR'
    }
  }
  return { prizePool: sum > 0 ? sum : null, currency }
}

export const devfolio = {
  name: 'devfolio',
  label: 'Devfolio',
  homepage: 'https://devfolio.co/hackathons',
  termsUrl: 'https://devfolio.co/terms',
  docsUrl: 'https://devfolio.co/hackathons',
  integration: 'public-api',
  note: 'Public listing API at api.devfolio.co. robots.txt permits all paths.',

  enabled: () => true,

  async fetchAll({ limit = 400, log } = {}) {
    const records = []
    const maxPages = 3
    const reference = new Date()

    for (let page = 1; page <= maxPages; page += 1) {
      let payload
      try {
        payload = await fetchJson(`${BASE}?page=${page}`)
      } catch (err) {
        log?.warn(`Devfolio page ${page} failed`, err.message)
        break
      }
      const rows = Array.isArray(payload?.result) ? payload.result : []
      if (!rows.length) break

      // Trim aggressively: the raw page is ~7 MB.
      const trimmed = rows.map(trim)
      for (const row of trimmed) {
        const record = normalise(row, reference)
        if (record) records.push(record)
      }

      const pages = Number(payload?.pages ?? 1)
      log?.debug(`Devfolio page ${page}/${pages} -> ${records.length} total`)
      if (page >= pages || records.length >= limit) break
    }

    log?.info(`Devfolio: ${records.length} events`)
    return records
  },
}

function normalise(row, reference = new Date()) {
  if (!row?.name || !row?.uuid) return null
  if (row.status && row.status !== 'publish') return null

  const tz = row.timezone || undefined
  const setting = row.setting ?? {}
  const startDate = parseSourceDate(row.starts_at, { timeZone: tz })
  const endDate = parseSourceDate(row.ends_at, { timeZone: tz, endOfDay: true })

  // Devfolio's endpoint returns its entire archive, the majority of which is
  // many years old. Keep only what is still actionable or finished within the
  // last 12 months — older records are not useful for discovery and would
  // drown the catalogue.
  const referenceMs = reference.getTime()
  const endsMs = endDate ? new Date(endDate).getTime() : null
  const startsMs = startDate ? new Date(startDate).getTime() : null
  const TWELVE_MONTHS = 365 * 86_400_000
  if (endsMs !== null) {
    if (endsMs < referenceMs - TWELVE_MONTHS) return null
  } else if (startsMs !== null) {
    // No end date: fall back to the start date.
    if (startsMs < referenceMs - TWELVE_MONTHS) return null
  } else {
    // Undated archive entries carry no discovery value.
    return null
  }

  const description = markdownToText(row.desc, { maxLength: 6000 })
  const { prizePool, currency } = totalPrize(row.prizes)

  const officialUrl =
    safeUrl(row.uri) ??
    safeUrl(setting.site) ??
    (row.slug ? `https://${row.slug}.devfolio.co` : null)

  const bannerUrl = normaliseImageUrl(row.cover_img) ?? normaliseImageUrl(setting.logo) ?? null

  const locationParts = [row.location, row.city, row.state, row.country].filter(Boolean)
  const location = locationParts.length ? [...new Set(locationParts)].join(', ') : null

  const themes = cleanTagList(row.themes ?? [], { max: 8, maxLength: 44 })

  const judgingFactors = clampString(setting.judging_factors, 800)
  const teamSize =
    row.team_min || row.team_size ? `${row.team_min ?? 1}–${row.team_size ?? '?'} members` : null

  const resources = []
  if (setting.coc_url) resources.push(`Code of conduct: ${setting.coc_url}`)
  if (setting.referral_prize_doc_link) resources.push(`Referral prize details: ${setting.referral_prize_doc_link}`)
  if (setting.twitter) resources.push(`Official X/Twitter: ${setting.twitter}`)
  if (setting.linkedin) resources.push(`LinkedIn: ${setting.linkedin}`)
  if (setting.discord) resources.push(`Discord: ${setting.discord}`)
  if (setting.contact_email) resources.push(`Contact: ${setting.contact_email}`)

  return {
    sourceName: 'devfolio',
    sourceEventId: String(row.uuid),
    title: stripTags(row.name),
    slug: row.slug ?? null,
    description: description || null,
    summary: truncate(row.tagline ? stripTags(row.tagline) : description, 240),
    organizer: 'Devfolio host',
    bannerUrl,
    officialUrl,
    registrationUrl: officialUrl,
    sourceUrl: `https://devfolio.co/${row.slug ?? ''}`,
    themes,
    technologies: [],
    startDate,
    endDate,
    registrationDeadline: parseSourceDate(setting.reg_ends_at, { timeZone: tz }),
    eventFormat: normaliseFormat({ isOnline: row.is_online, location }),
    location: row.is_online ? 'Online' : location,
    country: stripTags(row.country) || null,
    prizePool,
    currency,
    eligibility: null,
    eligibilityLevel: null,
    teamSize,
    judgingCriteria: judgingFactors,
    resources,
    faq: [],
    status: 'upcoming',
    // Devfolio's listing endpoint publishes no entry-fee information at all.
    // Its one superficially relevant field, `apply_mode`, is *who* may apply,
    // not what it costs — observed values are only "both" and "individual",
    // never "free" or "paid". Mapping it to a fee flag produced `isPaid: null`
    // for all 380 rows while looking like it worked, so the field is left
    // explicitly unknown and the reasoning is recorded here.
    isPaid: null,
    isFree: null,
    featured: Boolean(row.featured),
    registrationOpen: Boolean(setting.reg_starts_at) && Boolean(setting.reg_ends_at),
    participantCount: toNumber(row.participants_count),
    sourcePublishedAt: null,
    editionName: row.edition_name ?? null,
    isUniversityHackathon: row.is_university_hackathon === true,
  }
}
