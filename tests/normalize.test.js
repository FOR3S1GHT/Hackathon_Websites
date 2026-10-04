import { describe, expect, it } from 'vitest'
import { finalise, sanitiseFields, toListHackathon, toPublicHackathon } from '@server/pipeline/normalize.js'
import { CATEGORY_KEYS } from '@shared/taxonomy.js'

/** A raw, source-shaped record: what a connector produces before finalising. */
const raw = (overrides = {}) => ({
  title: 'Smart India Hackathon 2026',
  sourceName: 'devpost',
  sourceEventId: 'abc-123',
  sourceUrl: 'https://devpost.com/smart-india',
  summary: 'India’s largest hackathon.',
  description: 'Build anything with machine learning and React.',
  organizer: 'Smart India',
  startDate: '2030-01-10T00:00:00.000Z',
  endDate: '2030-01-12T00:00:00.000Z',
  location: 'Bengaluru, India',
  ...overrides,
})

describe('finalise — record admission', () => {
  it('keeps a complete record', () => {
    const out = finalise([raw()])
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('Smart India Hackathon 2026')
  })

  it('drops a record with no title rather than inventing one', () => {
    expect(finalise([raw({ title: null })])).toHaveLength(0)
    expect(finalise([raw({ title: '' })])).toHaveLength(0)
  })

  it('drops a record with no source, because provenance is not optional', () => {
    expect(finalise([raw({ sourceName: null })])).toHaveLength(0)
  })

  it('drops a record with no source event id', () => {
    expect(finalise([raw({ sourceEventId: null })])).toHaveLength(0)
    expect(finalise([raw({ sourceEventId: undefined })])).toHaveLength(0)
  })

  it('keeps a numeric source event id of zero, which is a valid id', () => {
    expect(finalise([raw({ sourceEventId: 0 })])).toHaveLength(1)
  })

  it('skips null entries in the input array instead of crashing', () => {
    expect(() => finalise([null, raw(), undefined])).not.toThrow()
    expect(finalise([null, raw(), undefined])).toHaveLength(1)
  })

  it('returns an empty array for empty input', () => {
    expect(finalise([])).toEqual([])
  })
})

describe('finalise — slugs', () => {
  it('derives a URL-safe slug from the title', () => {
    const [record] = finalise([raw({ title: 'Hack the Planet 2026: Finals' })])
    expect(record.slug).toBe('hack-the-planet-2026-finals')
    expect(record.slug).toMatch(/^[a-z0-9-]+$/)
  })

  it('gives two events with the same title different slugs', () => {
    const out = finalise([raw(), raw()])
    expect(out).toHaveLength(2)
    expect(out[0].slug).not.toBe(out[1].slug)
  })

  it('never reuses a slug that already exists in the catalogue', () => {
    const existing = new Set(['smart-india-hackathon-2026'])
    const [record] = finalise([raw()], { existingSlugs: existing })
    expect(record.slug).not.toBe('smart-india-hackathon-2026')
    expect(existing.has(record.slug)).toBe(false)
  })

  it('recomputes the slug rather than trusting an inbound one', () => {
    // A retitled event must get a fresh slug, otherwise its old URL 404s for
    // no reason and the new title is unreachable by search.
    const [record] = finalise([raw({ title: 'Renamed Event', slug: 'stale-slug' })])
    expect(record.slug).toBe('renamed-event')
  })

  it('keeps generating slugs even when all three candidates are taken', () => {
    const existing = new Set([
      'smart-india-hackathon-2026',
      'smart-india-hackathon-2026-event',
      'h-smart-india-hackathon-2026',
      'smart-india-hackathon-2026-2',
    ])
    const [record] = finalise([raw()], { existingSlugs: existing })
    expect(record.slug).toBe('smart-india-hackathon-2026-3')
  })

  it('produces a slug for a title made entirely of punctuation', () => {
    const [record] = finalise([raw({ title: '!!! ???' })])
    expect(typeof record.slug).toBe('string')
    expect(record.slug.length).toBeGreaterThan(0)
  })
})

describe('finalise — honesty and defaults', () => {
  it('leaves unpublished fields null rather than guessing', () => {
    const [record] = finalise([raw()])
    expect(record.prizePool).toBeNull()
    expect(record.currency).toBeNull()
    expect(record.participantCount).toBeNull()
    expect(record.teamSize).toBeNull()
    expect(record.registrationOpen).toBeNull()
    expect(record.sourcePublishedAt).toBeNull()
    expect(record.featured).toBe(false)
  })

  it('defaults the array fields to empty rather than undefined', () => {
    const [record] = finalise([raw()])
    expect(record.technologies).toEqual(expect.any(Array))
    expect(record.themes).toEqual(expect.any(Array))
    expect(record.resources).toEqual([])
    expect(record.faq).toEqual([])
    expect(record.duplicateOfSources).toEqual([])
  })

  it('defaults an unknown format to "unknown", never to online or offline', () => {
    const [record] = finalise([raw({ format: null, location: null, isOnline: null })])
    expect(record.eventFormat).toBe('unknown')
  })

  it('says "Unknown organizer" rather than leaving the field blank', () => {
    const [record] = finalise([raw({ organizer: null })])
    expect(record.organizer).toBe('Unknown organizer')
  })

  it('derives a summary from the description when the source published none', () => {
    const [record] = finalise([
      raw({
        summary: null,
        description:
          'This is a genuinely descriptive opening paragraph about the event that makes a fine summary for a card.',
      }),
    ])
    expect(record.summary).toBeTruthy()
    expect(record.summary.length).toBeLessThanOrEqual(400)
  })

  it('refuses to derive a summary from a rules-only description', () => {
    // The regression this guards: `summary ?? truncate(description, 300)` put
    // "Guidelines: • Eligibility: Open to all undergraduate…" on the card. A
    // connector returning a null summary was undone here, so the gate has to
    // live in the pipeline too, not only at the edge.
    const [record] = finalise([
      raw({
        summary: null,
        description:
          'Guidelines:\n• Eligibility: Open to all undergraduate and postgraduate students across India.\n' +
          '• Team Formation: teams of two to four members are allowed.\n' +
          'Rules:\n• All submissions must be original work of the team.',
      }),
    ])
    expect(record.summary).toBeNull()
    // The description itself is still kept in full.
    expect(record.description).toContain('Eligibility')
  })

  it('collapses newlines when deriving a summary, since cards render one line', () => {
    const [record] = finalise([
      raw({
        summary: null,
        description:
          'MalanHack is a national-level innovation sprint designed to unearth real-world problems and technically viable solutions.\n' +
          '\n' +
          'Registration closes on the fifteenth and teams may be one to four members.',
      }),
    ])
    expect(record.summary).toBeTruthy()
    expect(record.summary).not.toMatch(/\n/)
    expect(record.summary).toMatch(/^MalanHack is a national-level innovation sprint/)
  })

  it('always prefers an explicit source summary over a derived one', () => {
    const [record] = finalise([
      raw({
        summary: 'An explicit source summary wins.',
        description: 'Guidelines:\n• Eligibility: Open to all students everywhere in the country.',
      }),
    ])
    expect(record.summary).toBe('An explicit source summary wins.')
  })

  it('flattens a source-published summary too, not just a derived one', () => {
    // Real Devpost summaries arrive with paragraph breaks, e.g.
    // "About the Challenge\n\nCan you tell what happened in a cornfield from space?"
    const [record] = finalise([
      raw({
        summary: 'About the Challenge\n\nCan you tell what happened in a cornfield from space?\n\nAnd build it.',
      }),
    ])
    expect(record.summary).toBe('About the Challenge Can you tell what happened in a cornfield from space? And build it.')
  })

  it('leaves the full description paragraphed', () => {
    const [record] = finalise([
      raw({ summary: 'Flat.\n\nBlurb.', description: 'First paragraph.\n\nSecond paragraph.' }),
    ])
    expect(record.summary).not.toMatch(/\n/)
    expect(record.description).toContain('\n')
  })

  it('stamps firstDiscoveredAt when the source has no discovery time', () => {
    const [record] = finalise([raw()])
    expect(Number.isNaN(new Date(record.firstDiscoveredAt).getTime())).toBe(false)
  })

  it('preserves a discovery time the orchestrator already recorded', () => {
    const [record] = finalise([raw({ firstDiscoveredAt: '2025-05-05T00:00:00.000Z' })])
    expect(record.firstDiscoveredAt).toBe('2025-05-05T00:00:00.000Z')
  })

  it('classifies the record as part of finalisation', () => {
    const [record] = finalise([raw({ category: null, title: 'Robotics Sprint 2026' })])
    expect(Object.keys(CATEGORY_KEYS)).toContain(record.category)
  })
})

describe('finalise — hostile input', () => {
  it('truncates an oversized title instead of storing it whole', () => {
    const [record] = finalise([raw({ title: 'A'.repeat(5000) })])
    expect(record.title.length).toBeLessThanOrEqual(300)
  })

  it('truncates an oversized description', () => {
    const [record] = finalise([raw({ description: 'B'.repeat(50000) })])
    expect(record.description.length).toBeLessThanOrEqual(8000)
  })

  it('truncates every capped string field independently', () => {
    const [record] = finalise([
      raw({
        organizer: 'O'.repeat(1000),
        location: 'L'.repeat(1000),
        country: 'C'.repeat(1000),
        summary: 'S'.repeat(2000),
      }),
    ])
    expect(record.organizer.length).toBeLessThanOrEqual(200)
    expect(record.location.length).toBeLessThanOrEqual(200)
    expect(record.country.length).toBeLessThanOrEqual(100)
    expect(record.summary.length).toBeLessThanOrEqual(400)
  })

  it('does not let one bad record abort the whole batch', () => {
    const out = finalise([raw({ title: null }), raw({ title: 'Good Event' }), null])
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('Good Event')
  })

  it('handles a record whose text fields are the wrong JavaScript type', () => {
    expect(() =>
      finalise([raw({ title: 12345, description: { html: '<p>x</p>' }, themes: 'not-an-array' })]),
    ).not.toThrow()
  })
})

describe('sanitiseFields — the shared entry chokepoint', () => {
  // There are two ways source data reaches the store: `finalise` for a fresh
  // listing, and `enrichDetails` for a detail patch fetched on a later pass.
  // When those applied different rules, the 38 Devpost records enriched on the
  // second path kept paragraph-broken summaries while everything else was
  // cleaned. These assertions exist so the two paths cannot diverge again.

  it('applies the same summary rules finalise does', () => {
    const patch = sanitiseFields(raw({ summary: null, description: 'Guidelines:\n• Eligibility: Open to all.' }))
    expect(patch.summary).toBeNull()
    expect(finalise([raw({ summary: null, description: 'Guidelines:\n• Eligibility: Open to all.' })])[0].summary).toBeNull()
  })

  it('flattens a summary that arrives from a later detail pass', () => {
    const patch = sanitiseFields(raw({ summary: 'About the Challenge\n\nBuild it. Then present it.' }))
    expect(patch.summary).toBe('About the Challenge Build it. Then present it.')
  })

  it('caps an oversized value regardless of which path supplied it', () => {
    expect(sanitiseFields(raw({ description: 'B'.repeat(50000) })).description.length).toBeLessThanOrEqual(8000)
    expect(sanitiseFields(raw({ title: 'A'.repeat(5000) })).title.length).toBeLessThanOrEqual(300)
  })

  it('does not invent a slug, so an enrichment patch cannot change a live URL', () => {
    // finalise recomputes the slug deliberately; an enrichment patch must not,
    // because detail URLs are already shared and indexed.
    expect(sanitiseFields(raw({ slug: 'stable-slug' })).slug).toBe('stable-slug')
  })

  it('leaves classification and identity fields untouched', () => {
    const patch = sanitiseFields(raw({ id: 'keep-me', category: 'robotics', slug: 'keep-slug' }))
    expect(patch.id).toBe('keep-me')
    expect(patch.category).toBe('robotics')
  })

  it('preserves an explicit null rather than backfilling it', () => {
    // sanitiseFields runs on an already-complete stored record during
    // enrichment, so a field the source genuinely does not publish must stay
    // null rather than being replaced with a fallback.
    const patch = sanitiseFields(raw({ summary: null, description: null }))
    expect(patch.description).toBeNull()
    expect(patch.summary).toBeNull()
  })
})

describe('toPublicHackathon', () => {
  const record = finalise([raw()])[0]

  it('returns null for a missing record instead of throwing', () => {
    expect(toPublicHackathon(null)).toBeNull()
    expect(toPublicHackathon(undefined)).toBeNull()
  })

  it('serialises the id as a string', () => {
    expect(typeof toPublicHackathon({ id: 42 }).id).toBe('string')
  })

  it('exposes the three distinct time meanings separately', () => {
    // Conflating these is how a catalogue ends up claiming an event was
    // "published" on the day a crawler happened to find it.
    const payload = toPublicHackathon({
      id: 1,
      firstDiscoveredAt: '2025-01-01T00:00:00.000Z',
      sourcePublishedAt: '2024-06-01T00:00:00.000Z',
      updatedAt: '2025-03-01T00:00:00.000Z',
    })
    expect(payload.firstDiscoveredAt).toBe('2025-01-01T00:00:00.000Z')
    expect(payload.sourcePublishedAt).toBe('2024-06-01T00:00:00.000Z')
    expect(payload.updatedAt).toBe('2025-03-01T00:00:00.000Z')
  })

  it('always carries the source name and source URL for provenance', () => {
    const payload = toPublicHackathon(record)
    expect(payload.sourceName).toBe('devpost')
    expect(payload.sourceUrl).toContain('devpost.com')
  })

  it('defaults every array field so the frontend never guards for undefined', () => {
    const payload = toPublicHackathon({ id: 1 })
    for (const key of ['technologies', 'themes', 'resources', 'faq', 'duplicateOfSources']) {
      expect(payload[key], key).toEqual([])
    }
  })

  it('defaults eventFormat to "unknown" rather than guessing', () => {
    expect(toPublicHackathon({ id: 1 }).eventFormat).toBe('unknown')
  })

  it('normalises featured to a real boolean', () => {
    expect(toPublicHackathon({ id: 1, featured: 1 }).featured).toBe(true)
    expect(toPublicHackathon({ id: 1, featured: null }).featured).toBe(false)
  })

  it('does not leak internal or database-only fields', () => {
    const payload = toPublicHackathon({ ...record, __score: 9, internalNote: 'x' })
    expect(payload).not.toHaveProperty('__score')
    expect(payload).not.toHaveProperty('internalNote')
  })

  it('merges extra fields without dropping the base payload', () => {
    const payload = toPublicHackathon(record, { effectiveStatus: 'ongoing' })
    expect(payload.effectiveStatus).toBe('ongoing')
    expect(payload.title).toBe(record.title)
  })

  it('uses the same shape for list and detail views, so they cannot disagree', () => {
    expect(Object.keys(toListHackathon(record)).sort()).toEqual(
      Object.keys(toPublicHackathon(record)).sort(),
    )
  })
})