/**
 * Fixture builders.
 *
 * Every test that touches the datastore builds its records here, so a schema
 * change breaks in one place instead of twenty. The field names deliberately
 * match the *storage* schema (snake_case, as Supabase stores it) — that is the
 * layer the pipeline actually produces.
 */

let counter = 0
export const nextId = () => `test-hackathon-${(counter += 1)}`

export function resetIds() {
  counter = 0
}

/**
 * Build a storage-shaped hackathon record.
 * Only `title` and `sourceName` are required; everything else defaults to a
 * plausible, self-consistent value so a test only states what it cares about.
 */
export function makeHackathon(overrides = {}) {
  const {
    title = 'Test Hackathon',
    sourceName = 'devpost',
    slug,
    status,
    startDate = '2030-01-10T00:00:00.000Z',
    endDate = '2030-01-12T00:00:00.000Z',
    registrationDeadline,
    ...rest
  } = overrides

  const record = {
    id: rest.id ?? nextId(),
    slug: slug ?? slugify(title),
    title,
    summary: rest.summary ?? `${title} summary`,
    description: rest.description ?? null,
    organizer: rest.organizer ?? 'Test Organizer',
    source_name: sourceName,
    source_id: rest.sourceId ?? String(Math.abs(hash(title))),
    source_url: rest.sourceUrl ?? `https://example.test/${encodeURIComponent(title)}`,
    official_url: rest.officialUrl ?? null,
    registration_url: rest.registrationUrl ?? null,
    registration_deadline: registrationDeadline ?? null,
    start_date: startDate,
    end_date: endDate,
    status: status ?? 'upcoming',
    source_published_at: rest.sourcePublishedAt ?? null,
    first_discovered_at: rest.firstDiscoveredAt ?? '2025-01-01T00:00:00.000Z',
    last_verified_at: rest.lastVerifiedAt ?? '2025-01-01T00:00:00.000Z',
    category: rest.category ?? 'open-innovation',
    technologies: rest.technologies ?? [],
    themes: rest.themes ?? [],
    event_format: rest.eventFormat ?? 'online',
    location: rest.location ?? 'Online',
    country: rest.country ?? null,
    prize_pool: rest.prizePool ?? null,
    currency: rest.currency ?? null,
    team_size: rest.teamSize ?? null,
    participant_count: rest.participantCount ?? null,
    is_free: rest.isFree ?? null,
    is_paid: rest.isPaid ?? null,
    beginner_friendly: rest.beginnerFriendly ?? null,
    featured: rest.featured ?? false,
    judging_criteria: rest.judgingCriteria ?? null,
    eligibility: rest.eligibility ?? null,
    faq: rest.faq ?? [],
    banner_url: rest.bannerUrl ?? null,
  }

  // Drop keys that were explicitly passed as undefined so "field absent" and
  // "field is null" stay distinguishable in assertions about honest nulls.
  for (const key of Object.keys(record)) {
    if (record[key] === undefined) delete record[key]
  }
  return record
}

/**
 * Build a *normalised* record — the camelCase shape the pipeline emits before
 * storage, which is what classify.js / dedupe.js / search.js actually read.
 *
 * Distinct from `makeHackathon` (snake_case), which is the shape that comes
 * back out of a datastore. Confusing the two is the most likely cause of a test
 * that silently asserts nothing, so they are named for their layer.
 */
export function makeNormalized(overrides = {}) {
  const {
    title = 'Test Hackathon',
    sourceName = 'devpost',
    startDate = '2030-01-10T00:00:00.000Z',
    endDate = '2030-01-12T00:00:00.000Z',
    registrationDeadline,
    ...rest
  } = overrides

  const record = {
    id: rest.id ?? nextId(),
    slug: rest.slug ?? slugify(title),
    title,
    summary: rest.summary ?? `${title} summary`,
    description: rest.description ?? null,
    organizer: rest.organizer ?? 'Test Organizer',
    sourceName,
    sourceEventId: rest.sourceEventId ?? `evt-${Math.abs(hash(title))}`,
    sourceId: rest.sourceId ?? String(Math.abs(hash(title))),
    sourceUrl: rest.sourceUrl ?? `https://example.test/${encodeURIComponent(title)}`,
    officialUrl: rest.officialUrl ?? null,
    registrationUrl: rest.registrationUrl ?? null,
    registrationDeadline: registrationDeadline ?? null,
    registrationOpen: rest.registrationOpen ?? null,
    startDate,
    endDate,
    status: rest.status ?? 'upcoming',
    sourcePublishedAt: rest.sourcePublishedAt ?? null,
    firstDiscoveredAt: rest.firstDiscoveredAt ?? '2025-01-01T00:00:00.000Z',
    lastVerifiedAt: rest.lastVerifiedAt ?? '2025-01-01T00:00:00.000Z',
    category: rest.category ?? 'open-innovation',
    technologies: rest.technologies ?? [],
    themes: rest.themes ?? [],
    eventFormat: rest.eventFormat ?? 'online',
    location: rest.location ?? 'Online',
    country: rest.country ?? null,
    prizePool: rest.prizePool ?? null,
    currency: rest.currency ?? null,
    teamSize: rest.teamSize ?? null,
    participantCount: rest.participantCount ?? null,
    isFree: rest.isFree ?? null,
    isPaid: rest.isPaid ?? null,
    beginnerFriendly: rest.beginnerFriendly ?? null,
    eligibilityLevel: rest.eligibilityLevel ?? null,
    featured: rest.featured ?? false,
    judgingCriteria: rest.judgingCriteria ?? null,
    eligibility: rest.eligibility ?? null,
    resources: rest.resources ?? [],
    faq: rest.faq ?? [],
    bannerUrl: rest.bannerUrl ?? null,
    duplicateOfSources: [],
  }

  for (const key of Object.keys(record)) {
    if (record[key] === undefined) delete record[key]
  }
  return record
}

export function slugify(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
}

function hash(value) {
  let h = 0
  const text = String(value)
  for (let i = 0; i < text.length; i += 1) {
    h = (h << 5) - h + text.charCodeAt(i)
    h |= 0
  }
  return h
}