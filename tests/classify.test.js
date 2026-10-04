import { describe, expect, it } from 'vitest'
import {
  classifyCategory,
  detectBeginnerFriendly,
  detectCountry,
  enrich,
  extractTechnologies,
  extractThemes,
  normaliseFormat,
} from '@server/pipeline/classify.js'
import { CATEGORIES, CATEGORY_KEYS, TECHNOLOGIES } from '@shared/taxonomy.js'

/** CATEGORY_KEYS is a key -> label map, so the membership list is its keys. */
const VALID_KEYS = Object.keys(CATEGORY_KEYS)

/** Build the loose, source-shaped input the classifier actually receives. */
const hackathon = (overrides = {}) => ({
  title: 'Example',
  summary: '',
  description: null,
  themes: [],
  tags: [],
  technologies: [],
  ...overrides,
})

describe('classifyCategory', () => {
  it('returns a single category string from the shared taxonomy', () => {
    const result = classifyCategory(hackathon({ title: 'Build a fintech app' }))
    expect(typeof result).toBe('string')
    expect(VALID_KEYS).toContain(result)
  })

  it('falls back to open-innovation rather than inventing a category', () => {
    expect(classifyCategory(hackathon({ title: 'A weekend of general building' }))).toBe(
      'open-innovation',
    )
  })

  it('does not match short technology labels as substrings of ordinary words', () => {
    // The original bug: "ui" matched "build", "ar" matched "start", "vr"
    // matched "over", so three unrelated events landed in UI/UX, AR and VR.
    expect(
      classifyCategory(
        hackathon({ title: 'Build it: a weekend for everyone', description: 'Start building.' }),
      ),
    ).not.toBe('ui-ux-design')
    expect(
      classifyCategory(hackathon({ title: 'Over the finish line', description: 'Cross it.' })),
    ).not.toBe('robotics')
    expect(
      classifyCategory(hackathon({ title: 'Share the spark', description: 'Start a chain.' })),
    ).not.toBe('app-development')
  })

  it('does not read "ml" out of "html"', () => {
    // \bml\b must not fire inside "HTML", which is exactly the substring bug
    // in a different guise.
    expect(classifyCategory(hackathon({ title: 'HTML and CSS bootcamp' }))).not.toBe(
      'machine-learning',
    )
    expect(classifyCategory(hackathon({ title: 'ML engineering summit' }))).toBe('machine-learning')
  })

  it('still matches a short label when it appears as a whole word', () => {
    const result = classifyCategory(hackathon({ title: 'Robotics and IoT showcase' }))
    expect(result).toBe('robotics')
  })

  it('recognises the obvious category keywords', () => {
    const cases = [
      ['Machine learning for climate action', 'machine-learning'],
      ['Generative AI builders weekend', 'artificial-intelligence'],
      ['Blockchain hackathon', 'blockchain-web3'],
      ['Cybersecurity defence challenge', 'cybersecurity'],
      ['Robotics competition', 'robotics'],
      ['Sustainable cities hackathon', 'sustainability'],
      ['Fintech innovation sprint', 'fintech'],
      ['UX design jam', 'ui-ux-design'],
      ['Game jam weekend', 'game-development'],
      ['Mobile app showcase', 'app-development'],
      ['Data science challenge', 'data-science'],
      ['Web development sprint', 'web-development'],
      ['Cloud native challenge', 'cloud-computing'],
    ]
    for (const [title, expected] of cases) {
      expect(classifyCategory(hackathon({ title })), title).toBe(expected)
    }
  })

  it('weights the source-declared category above inferred keyword matches', () => {
    const result = classifyCategory(
      hackathon({
        title: 'Build an app',
        category: 'blockchain-web3',
        description: 'React and Node.js.',
      }),
    )
    expect(result).toBe('blockchain-web3')
  })

  it('weights the title above body text', () => {
    const result = classifyCategory(
      hackathon({
        title: 'Robotics sprint',
        description: 'This event also mentions machine learning, blockchain and fintech in passing.',
      }),
    )
    expect(result).toBe('robotics')
  })

  it('is deterministic — the same input always gives the same answer', () => {
    const input = hackathon({ title: 'AI for good hackathon', description: 'Machine learning.' })
    const first = classifyCategory(input)
    for (let i = 0; i < 5; i += 1) expect(classifyCategory(input)).toBe(first)
  })

  it('de-overlaps AI and machine learning into a single category', () => {
    const result = classifyCategory(
      hackathon({ title: 'AI/ML hackathon', description: 'Machine learning and deep learning.' }),
    )
    expect(['artificial-intelligence', 'machine-learning']).toContain(result)
  })

  it('survives null, undefined and non-string fields without throwing', () => {
    // A single malformed record must not abort the whole sync run.
    for (const bad of [null, undefined, 42, {}, [], true]) {
      expect(() =>
        classifyCategory(
          hackathon({ title: bad, summary: bad, description: bad, themes: bad, category: bad }),
        ),
      ).not.toThrow()
    }
    expect(() => classifyCategory()).not.toThrow()
  })
})

describe('extractTechnologies', () => {
  it('finds whole-word technologies and normalises them to taxonomy labels', () => {
    const found = extractTechnologies(
      hackathon({ description: 'Bring your React and Node.js apps. Python is welcome.' }),
    )
    expect(found).toContain('React')
    expect(found).toContain('Node.js')
    expect(found).toContain('Python')
  })

  it('de-duplicates case-insensitively', () => {
    const found = extractTechnologies(hackathon({ description: 'react, React, REACT, node.js' }))
    expect(found.filter((t) => t.toLowerCase() === 'react')).toHaveLength(1)
  })

  it('never returns duplicates or values outside the taxonomy', () => {
    const found = extractTechnologies(
      hackathon({ description: 'Python python Python Django Django Flask Flask' }),
    )
    expect(new Set(found).size).toBe(found.length)
    const labels = new Set(TECHNOLOGIES.map((t) => t.label))
    for (const tech of found) expect(labels).toContain(tech)
  })

  it('carries through technologies the source already labelled', () => {
    expect(extractTechnologies(hackathon({ technologies: ['Solidity'] }))).toContain('Solidity')
  })

  it('returns an empty array for a listing that mentions no known technology', () => {
    // Padding an empty list with plausible guesses is exactly the failure mode
    // this project is supposed to avoid.
    expect(extractTechnologies(hackathon({ title: 'An evening of conversation' }))).toEqual([])
  })

  it('returns an empty array rather than throwing on empty input', () => {
    expect(extractTechnologies(hackathon())).toEqual([])
    expect(extractTechnologies()).toEqual([])
  })
})

describe('extractThemes', () => {
  it('keeps the themes the organiser published', () => {
    const themes = extractThemes(hackathon({ themes: ['Open Ended', 'Productivity'] }))
    expect(themes).toContain('Open Ended')
    expect(themes).toContain('Productivity')
  })

  it('de-duplicates and caps the list', () => {
    const many = Array.from({ length: 40 }, (_, i) => `Theme ${i}`)
    const themes = extractThemes(hackathon({ themes: [...many, ...many] }))
    expect(themes.length).toBeLessThanOrEqual(12)
    expect(new Set(themes).size).toBe(themes.length)
  })
})

describe('detectBeginnerFriendly', () => {
  it('is true only when the source says so', () => {
    expect(
      detectBeginnerFriendly(hackathon({ description: 'No prior experience required.' })),
    ).toBe(true)
    expect(detectBeginnerFriendly(hackathon({ description: 'Open to all skill levels.' }))).toBe(true)
    expect(detectBeginnerFriendly(hackathon({ eligibility: 'For students only.' }))).toBe(true)
  })

  it('is null when the source publishes nothing — never a false guess', () => {
    // There is no such thing as beginnerHostile in the schema: a listing that
    // does not say is unknown, not false.
    expect(detectBeginnerFriendly(hackathon({ description: 'An event.' }))).toBeNull()
    expect(detectBeginnerFriendly(hackathon())).toBeNull()
  })
})

describe('normaliseFormat', () => {
  it('maps the usual spellings onto the canonical formats', () => {
    expect(normaliseFormat({ format: 'Online' })).toBe('online')
    expect(normaliseFormat({ format: 'Virtual' })).toBe('online')
    expect(normaliseFormat({ format: 'Remote' })).toBe('online')
    expect(normaliseFormat({ format: 'Onsite' })).toBe('offline')
    expect(normaliseFormat({ format: 'In person' })).toBe('offline')
    expect(normaliseFormat({ format: 'Hybrid' })).toBe('hybrid')
  })

  it('reads the isOnline boolean when there is no format string', () => {
    expect(normaliseFormat({ isOnline: true })).toBe('online')
    expect(normaliseFormat({ isOnline: false })).toBe('offline')
  })

  it('returns "unknown" when the source publishes no location at all', () => {
    // Deliberate: HackerEarth lists no venue, so calling it online or offline
    // would be a fabrication either way.
    expect(normaliseFormat({})).toBe('unknown')
    expect(normaliseFormat({ format: 'Somewhere vague' })).toBe('unknown')
    expect(normaliseFormat()).toBe('unknown')
  })
})

describe('detectCountry', () => {
  it('recognises a country from a free-text location', () => {
    expect(detectCountry({ location: 'Bengaluru, India' })).toBe('India')
    expect(detectCountry({ location: 'Toronto, Canada' })).toBe('Canada')
    expect(detectCountry({ address: 'Mitte, Berlin, Germany' })).toBe('Germany')
  })

  it('prefers an explicit country field when present', () => {
    expect(detectCountry({ country: 'Nigeria', location: 'Lagos, Nigeria' })).toBe('Nigeria')
  })

  it('is null when nothing identifies a country', () => {
    expect(detectCountry({ location: 'Somewhere' })).toBeNull()
    expect(detectCountry({})).toBeNull()
    expect(detectCountry()).toBeNull()
  })
})

describe('enrich', () => {
  it('returns the input plus every classification field in one pass', () => {
    const result = enrich(
      hackathon({
        title: 'AI for climate hackathon',
        description: 'Use machine learning and React to build for the planet.',
        themes: ['Sustainability', 'AI'],
      }),
    )
    expect(result).toHaveProperty('category')
    expect(result).toHaveProperty('technologies')
    expect(result).toHaveProperty('themes')
    expect(result).toHaveProperty('beginnerFriendly')
    expect(result).toHaveProperty('country')
    expect(result.title).toBe('AI for climate hackathon')
  })

  it('never invents a prize pool, a team size or a participant count', () => {
    const result = enrich(hackathon({ title: 'Build something' }))
    expect(result.prizePool ?? null).toBeNull()
    expect(result.teamSize ?? null).toBeNull()
    expect(result.participantCount ?? null).toBeNull()
  })

  it('only ever emits taxonomy categories, for every seeded keyword', () => {
    for (const title of [
      'AI hackathon',
      'Blockchain bootcamp',
      'Robotics sprint',
      'Cybersecurity drill',
      'UI design jam',
      'Cloud challenge',
      'Fintech week',
      'Game jam',
      'Sustainability sprint',
      'Data science bowls',
      'Mobile app build',
      'Web weekend',
      'Open innovation jam',
      'Machine learning meetup',
    ]) {
      expect(VALID_KEYS, title).toContain(enrich(hackathon({ title })).category)
    }
  })

  it('classifies against technologies it extracted in the same pass', () => {
    const result = enrich(
      hackathon({ title: 'Ship something fast', description: 'Solidity and DeFi smart contracts.' }),
    )
    expect(result.technologies).toContain('Solidity')
    expect(VALID_KEYS).toContain(result.category)
  })
})

describe('shared taxonomy integrity', () => {
  it('exposes exactly the 14 documented categories', () => {
    expect(CATEGORIES).toHaveLength(14)
  })

  it('gives every category a key, label, blurb and a unique key', () => {
    const keys = CATEGORIES.map((c) => c.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const category of CATEGORIES) {
      expect(category.key).toMatch(/^[a-z0-9-]+$/)
      expect(category.label.length).toBeGreaterThan(0)
      expect(category.blurb.length).toBeGreaterThan(10)
      expect(Array.isArray(category.keywords)).toBe(true)
    }
  })

  it('gives every technology a key, label and unique key', () => {
    const keys = TECHNOLOGIES.map((t) => t.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const tech of TECHNOLOGIES) {
      expect(tech.key).toMatch(/^[a-z0-9-]+$/)
      expect(tech.label.length).toBeGreaterThan(0)
    }
  })
})