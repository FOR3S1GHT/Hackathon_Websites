import { slugify, clampString, hasDescriptiveProse, truncate } from '../lib/text.js'
import { enrich } from './classify.js'
import { now } from '../lib/dates.js'

/**
 * Final normalisation pass: applies classification, guarantees a unique slug,
 * and enforces length limits on every externally-sourced string.
 */

const MAX = {
  title: 300,
  description: 8000,
  summary: 400,
  organizer: 200,
  location: 200,
  country: 100,
  eligibility: 2000,
  teamSize: 120,
  judgingCriteria: 3000,
}

function slugCandidates(title) {
  const base = slugify(title)
  return [base, `${base}-event`, `h-${base}`]
}

/**
 * Derive a card summary from a description, or return null.
 *
 * The fallback exists because plenty of sources publish a `description` but no
 * `summary`, and a first paragraph is far better than an empty card. But some
 * sources publish a description that is *only* rules — "Guidelines:", "• Team
 * size: 1–4 members" — and truncating one of those produces a blurb that reads
 * like a form. `hasDescriptiveProse` is the same gate the source connectors use,
 * applied here so no path can reintroduce the problem.
 *
 * Newlines are collapsed because a summary is rendered as one line in a card; the
 * full description keeps its structure.
 */
function deriveSummary(description) {
  if (!description) return null
  if (!hasDescriptiveProse(description)) return null
  return truncate(description.replace(/\s+/g, ' ').trim(), 300)
}

/**
 * Collapse a summary onto one line.
 *
 * A summary is a card blurb. Sources publish them with paragraph breaks — Devpost
 * summaries routinely look like "About the Challenge\n\nCan you tell what happened
 * in a cornfield from space?\n\nHack the Harvest is…" — which renders as a ragged
 * block and bloats the payload for no benefit. HTML collapses the whitespace
 * anyway, so this changes nothing visually and only removes the noise. The full
 * `description` keeps its structure, which is where paragraphing belongs.
 */
function flattenSummary(summary) {
  if (!summary) return summary
  const flat = summary.replace(/\s+/g, ' ').trim()
  return flat || summary
}

/**
 * Apply the length limits and summary rules to one externally-sourced record.
 *
 * Exported because there are two entry points where data from a source reaches
 * the store — `finalise` for a fresh listing and `enrichDetails` for a detail
 * patch fetched later — and they must not diverge. That divergence already
 * happened once: the summary gate was added here, and the 38 Devpost records
 * that are enriched on a separate pass kept arriving with paragraph breaks,
 * because the second path skipped this function entirely. One chokepoint, so a
 * rule cannot be enforced on one path and forgotten on the other.
 *
 * Does not touch `slug`, `id` or classification; callers handle those.
 */
export function sanitiseFields(raw) {
  return {
    ...raw,
    title: clampString(raw.title, MAX.title),
    description: clampString(raw.description, MAX.description),
    summary: flattenSummary(clampString(raw.summary, MAX.summary) ?? deriveSummary(raw.description)),
    organizer: clampString(raw.organizer, MAX.organizer) ?? 'Unknown organizer',
    location: clampString(raw.location, MAX.location),
    country: clampString(raw.country, MAX.country),
    eligibility: clampString(raw.eligibility, MAX.eligibility),
    teamSize: clampString(raw.teamSize, MAX.teamSize),
    judgingCriteria: clampString(raw.judgingCriteria, MAX.judgingCriteria),
  }
}

export function finalise(records, { existingSlugs = new Set() } = {}) {
  const taken = new Set(existingSlugs)
  const out = []

  for (const raw of records) {
    if (!raw?.title || !raw?.sourceName || raw.sourceEventId === undefined || raw.sourceEventId === null) {
      continue
    }

    const enriched = enrich({
      ...sanitiseFields(raw),
      slug: null, // always recomputed so a retitled event gets a fresh slug
    })

    let slug = slugCandidates(enriched.title).find((c) => !taken.has(c))
    if (!slug) {
      let n = 2
      while (taken.has(`${slugify(enriched.title)}-${n}`)) n += 1
      slug = `${slugify(enriched.title)}-${n}`
    }
    taken.add(slug)

    out.push({
      id: undefined,
      technologies: [],
      themes: [],
      resources: [],
      faq: [],
      duplicateOfSources: [],
      prizePool: null,
      currency: null,
      registrationOpen: null,
      featured: false,
      participantCount: null,
      sourcePublishedAt: null,
      status: 'upcoming',
      eventFormat: 'unknown',
      ...enriched,
      slug,
      firstDiscoveredAt: raw.firstDiscoveredAt ?? now().toISOString(),
    })
  }

  return out
}

/** Everything the API returns for a hackathon — never leaks internal fields. */
export function toPublicHackathon(record, extra = {}) {
  if (!record) return null
  return {
    id: String(record.id),
    title: record.title,
    slug: record.slug,
    description: record.description ?? null,
    summary: record.summary ?? null,
    organizer: record.organizer ?? null,
    bannerUrl: record.bannerUrl ?? null,
    officialUrl: record.officialUrl ?? null,
    registrationUrl: record.registrationUrl ?? null,
    sourceUrl: record.sourceUrl ?? null,
    sourceName: record.sourceName,
    sourceEventId: record.sourceEventId,
    category: record.category ?? null,
    technologies: record.technologies ?? [],
    themes: record.themes ?? [],
    startDate: record.startDate ?? null,
    endDate: record.endDate ?? null,
    registrationDeadline: record.registrationDeadline ?? null,
    eventFormat: record.eventFormat ?? 'unknown',
    location: record.location ?? null,
    country: record.country ?? null,
    prizePool: record.prizePool ?? null,
    currency: record.currency ?? null,
    eligibility: record.eligibility ?? null,
    eligibilityLevel: record.eligibilityLevel ?? null,
    beginnerFriendly: record.beginnerFriendly ?? null,
    teamSize: record.teamSize ?? null,
    judgingCriteria: record.judgingCriteria ?? null,
    resources: record.resources ?? [],
    faq: record.faq ?? [],
    status: record.status ?? null,
    isPaid: record.isPaid ?? null,
    isFree: record.isFree ?? null,
    featured: Boolean(record.featured),
    registrationOpen: record.registrationOpen ?? null,
    participantCount: record.participantCount ?? null,
    competitionType: record.competitionType ?? 'hackathon',
    firstDiscoveredAt: record.firstDiscoveredAt ?? null,
    sourcePublishedAt: record.sourcePublishedAt ?? null,
    lastVerifiedAt: record.lastVerifiedAt ?? null,
    updatedAt: record.updatedAt ?? null,
    createdAt: record.createdAt ?? null,
    duplicateOfSources: record.duplicateOfSources ?? [],
    ...extra,
  }
}

/**
 * List-view payload.
 *
 * Deliberately the same shape as the detail payload. An earlier draft trimmed
 * it, which meant a card and a detail page could disagree about a field and the
 * frontend needed two shapes to reason about. One shape, one contract.
 */
export function toListHackathon(record, extra = {}) {
  return toPublicHackathon(record, extra)
}
