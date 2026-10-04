import { describe, expect, it } from 'vitest'
import { SIMILARITY_THRESHOLD, areDuplicates, dedupe, fingerprint, titleTokens } from '@server/pipeline/dedupe.js'
import { tokenSet } from '@server/lib/text.js'
import { makeNormalized } from './helpers/fixtures.js'

describe('titleTokens', () => {
  it('lowercases and strips punctuation', () => {
    expect(titleTokens('Smart India Hackathon: 2026!')).toEqual(['smart', 'india'])
  })

  it('removes the filler words and bare years every event title shares', () => {
    // If these were kept, every title would overlap every other title and the
    // similarity threshold would merge unrelated events.
    const tokens = titleTokens('The Annual Global Hackathon 2026 Edition')
    expect(tokens).not.toContain('the')
    expect(tokens).not.toContain('hackathon')
    expect(tokens).not.toContain('global')
    expect(tokens).not.toContain('2026')
    expect(tokens).toContain('annual')
  })

  it('drops bare numbers, which carry no identity on their own', () => {
    expect(titleTokens('Hackathon 2031')).toEqual([])
  })

  it('drops words of two characters or fewer', () => {
    // Short tokens are noise for cross-source matching and would collide
    // constantly.
    expect(titleTokens('Go Build It Up')).toEqual(['build'])
  })

  it('is deterministic — the same input always yields the same list', () => {
    const a = titleTokens('Robotics Summit India')
    expect(titleTokens('Robotics Summit India')).toEqual(a)
    expect(a).toEqual(['robotics', 'summit', 'india'])
  })

  it('leaves de-duplication to tokenSet, which every caller actually uses', () => {
    expect(tokenSet('Robotics Robotics India India').size).toBe(2)
  })

  it('returns an empty array rather than throwing on empty input', () => {
    expect(titleTokens('')).toEqual([])
    expect(titleTokens(null)).toEqual([])
    expect(titleTokens(undefined)).toEqual([])
  })
})

describe('fingerprint', () => {
  it('is identical for two spellings of the same event', () => {
    const a = fingerprint(makeNormalized({ title: 'Smart India Hackathon 2026' }))
    const b = fingerprint(makeNormalized({ title: 'smart india hackathon 2026', slug: 'x' }))
    expect(a).toBe(b)
  })
})

describe('areDuplicates', () => {
  const base = {
    startDate: '2030-04-01T00:00:00.000Z',
    endDate: '2030-04-03T00:00:00.000Z',
  }

  it('matches the same title regardless of punctuation and casing', () => {
    expect(
      areDuplicates(
        makeNormalized({ title: 'Global AI Hackathon 2026', ...base }),
        makeNormalized({ title: 'global ai hackathon — 2026', ...base }),
      ),
    ).toBe(true)
  })

  it('does not merge two clearly different events on the same dates', () => {
    expect(
      areDuplicates(
        makeNormalized({ title: 'Global AI Hackathon', ...base }),
        makeNormalized({ title: 'Blockchain Builders Summit', ...base }),
      ),
    ).toBe(false)
  })

  it('does not merge the same title happening in completely different years', () => {
    expect(
      areDuplicates(
        makeNormalized({ title: 'Annual Robotics Sprint', startDate: '2030-04-01T00:00:00.000Z' }),
        makeNormalized({ title: 'Annual Robotics Sprint', startDate: '2034-04-01T00:00:00.000Z' }),
      ),
    ).toBe(false)
  })

  it('does not merge two different events sharing a generic year in the title', () => {
    // "2026" alone must not be enough evidence.
    expect(
      areDuplicates(
        makeNormalized({ title: 'Hackathon 2026 Berlin', ...base }),
        makeNormalized({ title: 'Hackathon 2026 Mumbai', ...base }),
      ),
    ).toBe(false)
  })

  it('is symmetric', () => {
    const a = makeNormalized({ title: 'Smart India Hackathon', ...base })
    const b = makeNormalized({ title: 'Smart India Hackathon 2026', ...base })
    expect(areDuplicates(a, b)).toBe(areDuplicates(b, a))
  })

  it('is case-insensitive and tolerates missing fields', () => {
    expect(
      areDuplicates(
        makeNormalized({ title: 'Open Source Weekend', ...base }),
        makeNormalized({ title: 'open source weekend', startDate: null, endDate: null }),
      ),
    ).toBe(true)
  })

  it('exports a documented threshold', () => {
    expect(SIMILARITY_THRESHOLD).toBeGreaterThan(0)
    expect(SIMILARITY_THRESHOLD).toBeLessThanOrEqual(1)
  })
})

describe('dedupe', () => {
  it('returns { records, clusters } — not a bare array', () => {
    const result = dedupe([makeNormalized({ title: 'Solo Event' })])
    expect(result).toHaveProperty('records')
    expect(result).toHaveProperty('clusters')
    expect(Array.isArray(result.records)).toBe(true)
  })

  it('collapses a duplicated event into a single surviving record', () => {
    const result = dedupe([
      makeNormalized({ title: 'Smart India Hackathon 2026', sourceName: 'devpost' }),
      makeNormalized({ title: 'Smart India Hackathon 2026', sourceName: 'unstop' }),
    ])
    expect(result.records).toHaveLength(1)
  })

  it('records every merged source so the UI can show provenance', () => {
    const result = dedupe([
      makeNormalized({ title: 'Smart India Hackathon 2026', sourceName: 'devpost' }),
      makeNormalized({ title: 'Smart India Hackathon 2026', sourceName: 'unstop' }),
    ])
    expect(result.clusters.length).toBeGreaterThan(0)
    const merged = result.clusters.find((c) => (c.members?.length ?? c.length ?? 0) >= 2)
    expect(merged).toBeDefined()
  })

  it('prefers the record with the most complete detail', () => {
    const sparse = makeNormalized({
      title: 'Rich Event 2026',
      sourceName: 'devpost',
      description: null,
      bannerUrl: null,
      prizePool: null,
    })
    const rich = makeNormalized({
      title: 'Rich Event 2026',
      sourceName: 'unstop',
      description: 'A full description that the other record lacks entirely.',
      bannerUrl: 'https://cdn.example/banner.png',
      prizePool: 10000,
    })
    const result = dedupe([sparse, rich])
    expect(result.records).toHaveLength(1)
    expect(result.records[0].description).toBe(rich.description)
  })

  it('keeps genuinely different events apart', () => {
    const result = dedupe([
      makeNormalized({ title: 'Alpha Hackathon 2026' }),
      makeNormalized({ title: 'Beta Summit 2026' }),
      makeNormalized({ title: 'Gamma Jam 2026' }),
    ])
    expect(result.records).toHaveLength(3)
  })

  it('is deterministic regardless of input order', () => {
    const a = makeNormalized({ title: 'Repeat Event 2026', sourceName: 'devpost' })
    const b = makeNormalized({ title: 'Repeat Event 2026', sourceName: 'unstop', description: 'longer text here' })
    const forward = dedupe([a, b])
    const reverse = dedupe([b, a])
    expect(forward.records).toHaveLength(1)
    expect(reverse.records).toHaveLength(1)
    expect(forward.records[0].description).toBe(reverse.records[0].description)
  })

  it('handles an empty input without throwing', () => {
    expect(dedupe([])).toEqual({ records: [], clusters: [] })
  })

  it('never returns more records than it was given', () => {
    const records = Array.from({ length: 25 }, (_, i) =>
      makeNormalized({
        title: `Event Number ${i}`,
        startDate: `2030-04-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
      }),
    )
    const result = dedupe(records)
    expect(result.records.length).toBeLessThanOrEqual(records.length)
  })
})