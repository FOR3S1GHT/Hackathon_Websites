import { tokenSet, jaccard, slugify, titleTokens } from '../lib/text.js'

/**
 * Cross-source duplicate detection.
 *
 * The same physical event is frequently listed on several platforms (an MLH
 * event on Devpost, an MLH event on Devfolio, the same event mirrored by
 * HackerEarth). Devpost's own `featured` flag is a strong signal, and
 * `organization_name` often matches the Devfolio organiser.
 *
 * We never silently drop data: the primary record is kept and the duplicate's
 * distinguishing information is folded in (missing themes, prizes, a longer
 * description, an extra registration link), then linked via
 * `duplicateOfIds` so the UI can show "also listed on Devpost".
 */

const SIMILARITY_THRESHOLD = 0.62

/** Cheap pre-filter: share at least one meaningful token. */
function mayOverlap(a, b) {
  for (const token of a.tokens) {
    if (b.tokens.has(token)) return true
  }
  return false
}

function buildSignature(hackathon) {
  return {
    hackathon,
    tokens: tokenSet(hackathon.title),
    normalisedTitle: slugify(hackathon.title),
    organizer: (hackathon.organizer ?? '').toLowerCase().trim(),
    startDate: hackathon.startDate ?? null,
    registrationUrl: hackathon.registrationUrl ?? null,
    officialUrl: hackathon.officialUrl ?? null,
  }
}

/** Same start date is corroborating evidence; far apart means two editions. */
function editionsApart(a, b, toleranceDays = 21) {
  if (!a || !b) return false
  const da = new Date(a)
  const db = new Date(b)
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false
  return Math.abs(da - db) / 86_400_000 > toleranceDays
}

export function areDuplicates(a, b) {
  const sa = buildSignature(a)
  const sb = buildSignature(b)

  // Strong identifiers first. These are conclusive on their own: the same
  // registration URL cannot belong to two different events.
  if (sa.registrationUrl && sb.registrationUrl && sa.registrationUrl === sb.registrationUrl) return true
  if (sa.officialUrl && sb.officialUrl && sa.officialUrl === sb.officialUrl) return true

  if (
    sa.normalisedTitle &&
    sb.normalisedTitle &&
    sa.normalisedTitle === sb.normalisedTitle &&
    (!sa.organizer || !sb.organizer || sa.organizer === sb.organizer)
  ) {
    // An identical title is not sufficient on its own: a recurring series such
    // as "Annual Robotics Sprint" reuses the same title every year, and
    // collapsing those would silently delete a real edition from the catalogue.
    return !editionsApart(sa.startDate, sb.startDate)
  }

  if (!sa.tokens.size || !sb.tokens.size) return false
  if (!mayOverlap(sa, sb)) return false

  const similarity = jaccard(sa.tokens, sb.tokens)
  if (similarity < SIMILARITY_THRESHOLD) return false

  // Same start date is corroborating evidence; different dates mean two
  // genuinely different editions of a recurring series.
  if (editionsApart(sa.startDate, sb.startDate)) return false

  // If both list an organiser it must plausibly agree.
  if (sa.organizer && sb.organizer) {
    const orgA = tokenSet(sa.organizer)
    const orgB = tokenSet(sb.organizer)
    if (orgA.size && orgB.size && jaccard(orgA, orgB) < 0.34) return false
  }

  return true
}

/** Merge useful fields from `loser` into `winner` without overwriting good data. */
function mergeRecord(winner, loser) {
  const pick = (field) => {
    if (!winner[field] && loser[field]) winner[field] = loser[field]
  }

  pick('description')
  pick('summary')
  pick('bannerUrl')
  pick('officialUrl')
  pick('registrationUrl')
  pick('registrationDeadline')
  pick('judgingCriteria')
  pick('eligibility')
  pick('teamSize')
  pick('location')
  pick('country')
  pick('currency')
  pick('eligibilityLevel')
  pick('participantCount')
  pick('sourcePublishedAt')

  if (!(winner.prizePool > 0) && loser.prizePool > 0) {
    winner.prizePool = loser.prizePool
    winner.currency = winner.currency ?? loser.currency
  }

  const mergeList = (field, limit = 20) => {
    const current = new Set((winner[field] ?? []).map((v) => String(v).toLowerCase()))
    for (const item of loser[field] ?? []) {
      if (current.size >= limit) break
      const key = String(item).toLowerCase()
      if (!current.has(key)) {
        current.add(key)
        winner[field] = [...(winner[field] ?? []), item]
      }
    }
  }
  mergeList('technologies', 14)
  mergeList('themes', 12)
  mergeList('resources', 16)
  mergeList('faq', 12)
  mergeList('duplicateOfSources', 8)

  // Prefer the longer, more informative description.
  if ((loser.description?.length ?? 0) > (winner.description?.length ?? 0) * 1.4) {
    winner.description = loser.description
  }

  // RegistrationOpen is tri-state (unknown / true / false) — never downgrade a
  // known-open event to unknown because another source omitted the field.
  if (winner.registrationOpen === null || winner.registrationOpen === undefined) {
    winner.registrationOpen = loser.registrationOpen ?? null
  }

  winner.featured = Boolean(winner.featured || loser.featured)
  return winner
}

/**
 * Group records into duplicate clusters and reduce each cluster to one record.
 *
 * @returns {{ records: object[], clusters: object[][] }}
 *   `records[i]` is the merged winner of `clusters[i]`, so callers can inspect
 *   membership (e.g. to tell a genuinely new event from one already stored).
 *
 * Deterministic: the winner is chosen by source priority, then richness, then
 * earliest discovery, so repeated syncs always produce identical output.
 */
export function dedupe(records, { sourcePriority = ['devpost', 'unstop', 'devfolio', 'hackerearth', 'kaggle'] } = {}) {
  if (records.length <= 1) {
    const singleton = records.map((r) => ({ ...r, duplicateOfSources: r.duplicateOfSources ?? [] }))
    return { records: singleton, clusters: singleton.map((r) => [r]) }
  }

  const signatures = records.map(buildSignature)
  const parent = records.map((_, i) => i)

  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }
  const union = (i, j) => {
    const ri = find(i)
    const rj = find(j)
    if (ri !== rj) parent[Math.max(ri, rj)] = Math.min(ri, rj)
  }

  // Bucket by the first title token to avoid an O(n^2) sweep of the whole set.
  const buckets = new Map()
  signatures.forEach((sig, index) => {
    const tokens = [...sig.tokens].sort()
    const bucketKey = tokens[0] ?? `__empty${index}`
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, [])
    buckets.get(bucketKey).push(index)
  })

  for (const indices of buckets.values()) {
    for (let a = 0; a < indices.length; a += 1) {
      for (let b = a + 1; b < indices.length; b += 1) {
        if (areDuplicates(records[indices[a]], records[indices[b]])) {
          union(indices[a], indices[b])
        }
      }
    }
  }

  const clusters = new Map()
  records.forEach((_, index) => {
    const root = find(index)
    if (!clusters.has(root)) clusters.set(root, [])
    clusters.get(root).push(index)
  })

  const priorityOf = (record) => {
    const idx = sourcePriority.indexOf(record.sourceName)
    return idx === -1 ? sourcePriority.length : idx
  }
  const richnessOf = (record) =>
    (record.description?.length ?? 0) +
    (record.themes?.length ?? 0) * 40 +
    (record.technologies?.length ?? 0) * 20 +
    (record.prizePool ? 200 : 0) +
    (record.judgingCriteria ? 150 : 0) +
    (record.bannerUrl ? 80 : 0)

  const out = []
  const clusterMembers = []
  for (const indices of clusters.values()) {
    const members = indices.map((i) => records[i])
    const sorted = [...members].sort((a, b) => {
      const p = priorityOf(a) - priorityOf(b)
      if (p !== 0) return p
      const r = richnessOf(b) - richnessOf(a)
      if (r !== 0) return r
      return new Date(a.firstDiscoveredAt ?? 0) - new Date(b.firstDiscoveredAt ?? 0)
    })

    const winner = { ...sorted[0], duplicateOfSources: [] }
    for (const loser of sorted.slice(1)) {
      mergeRecord(winner, loser)
      if (!winner.duplicateOfSources.includes(loser.sourceName)) {
        winner.duplicateOfSources.push(loser.sourceName)
      }
      // Preserve the earliest discovery timestamp across the cluster so
      // "recently added" reflects the earliest real sighting.
      const dates = [winner.firstDiscoveredAt, loser.firstDiscoveredAt].filter(Boolean).sort()
      if (dates.length) winner.firstDiscoveredAt = dates[0]
    }
    out.push(winner)
    clusterMembers.push(members)
  }

  return { records: out, clusters: clusterMembers }
}

/**
 * A stable cross-source identity key used to detect the *same* event when it
 * reappears in a later sync run under a different source row id.
 */
export function fingerprint(hackathon) {
  const parts = [
    slugify(hackathon.title ?? ''),
    (hackathon.startDate ?? '').slice(0, 10),
  ].filter(Boolean)
  return parts.join('|')
}

export { titleTokens, SIMILARITY_THRESHOLD }
