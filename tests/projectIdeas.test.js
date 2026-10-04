import { describe, expect, it } from 'vitest'
import {
  TIME_ESTIMATES,
  availableConceptCount,
  extractSignals,
  generateIdeas,
  ideaToText,
  inferDifficulty,
} from '@server/services/projectIdeas.js'
import { DIFFICULTIES } from '@shared/taxonomy.js'

/** A hackathon as the generator receives it: whatever the source published. */
const event = (overrides = {}) => ({
  id: 'h1',
  slug: 'smart-india-hackathon-2026',
  title: 'Smart India Hackathon 2026',
  organizer: 'Smart India',
  category: 'artificial-intelligence',
  technologies: ['Python', 'React'],
  themes: ['AI'],
  eligibility: 'Open to all skill levels.',
  description: 'Build anything using machine learning.',
  ...overrides,
})

/** Regex-safe a user-visible string so it can be used inside an assertion. */
const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

describe('extractSignals', () => {
  it('reads the event’s own published themes and technologies', () => {
    const signals = extractSignals(event())
    expect(signals.themes).toEqual(['AI'])
    expect(signals.technologies).toEqual(['Python', 'React'])
    expect(signals.category).toBe('artificial-intelligence')
  })

  it('prefers a published theme as the primary theme', () => {
    expect(extractSignals(event({ themes: ['Digital Health'] })).theme).toBe('Digital Health')
  })

  it('falls back to the subtitle when no theme was published', () => {
    const signals = extractSignals(event({ themes: [], title: 'Global Build: Climate Edition' }))
    expect(signals.theme).toBe('Climate Edition')
  })

  it('falls back to the category when the event published nothing thematic', () => {
    expect(extractSignals(event({ themes: [], title: 'Smart India Hackathon 2026' })).theme).toBe(
      'artificial intelligence',
    )
  })

  it('never returns an empty theme, because it is interpolated into every title', () => {
    for (const hackathon of [
      event({ themes: [], title: '' }),
      event({ themes: [''], title: 'X' }),
      event({ themes: [], title: 'X', category: null }),
    ]) {
      expect(extractSignals(hackathon).theme.length).toBeGreaterThan(0)
    }
  })

  it('caps the theme length so titles stay readable', () => {
    // truncate() appends an ellipsis, so the bound is the cap plus one glyph.
    expect(extractSignals(event({ themes: ['T'.repeat(500)] })).theme.length).toBeLessThanOrEqual(61)
  })

  it('does not throw on an event with no fields at all', () => {
    expect(() => extractSignals({})).not.toThrow()
  })
})

describe('inferDifficulty', () => {
  it('always returns a level from the shared difficulty list', () => {
    for (const hackathon of [
      event(),
      event({ category: 'robotics', technologies: ['ROS', 'Rust'] }),
      event({ eligibility: 'Beginners welcome.' }),
      event({ eligibility: 'Experienced participants only.' }),
    ]) {
      expect(DIFFICULTIES).toContain(inferDifficulty(extractSignals(hackathon)).difficulty)
    }
  })

  it('raises difficulty when the event asks for prior experience', () => {
    const open = inferDifficulty(extractSignals(event({ eligibility: 'Open to everyone.' })))
    const expert = inferDifficulty(
      extractSignals(event({ eligibility: 'Intermediate or advanced experience required.' })),
    )
    expect(['beginner', 'intermediate', 'advanced'].indexOf(expert.difficulty)).toBeGreaterThan(
      ['beginner', 'intermediate', 'advanced'].indexOf(open.difficulty),
    )
  })

  it('lowers difficulty when the event explicitly welcomes beginners', () => {
    const result = inferDifficulty(
      extractSignals(event({ category: 'open-innovation', eligibility: 'No prior experience needed.' })),
    )
    expect(result.difficulty).toBe('beginner')
    expect(result.reasons.length).toBeGreaterThan(0)
  })

  it('explains itself, so the UI can justify the label', () => {
    const result = inferDifficulty(extractSignals(event()))
    expect(Array.isArray(result.reasons)).toBe(true)
    expect(result.reasons.length).toBeGreaterThan(0)
  })

  it('is deterministic', () => {
    const signals = extractSignals(event())
    expect(inferDifficulty(signals)).toEqual(inferDifficulty(signals))
  })
})

describe('generateIdeas — shape', () => {
  const ideas = generateIdeas(event(), { count: 3 })

  it('returns the requested number of ideas', () => {
    expect(ideas).toHaveLength(3)
  })

  it('never returns two ideas with the same title', () => {
    // With a single published theme, a naive rotation prints "AI Triage
    // Copilot" twice on one screen.
    for (let count = 1; count <= 6; count += 1) {
      const titles = generateIdeas(event(), { count }).map((i) => i.title.toLowerCase())
      expect(new Set(titles).size, `count=${count}`).toBe(titles.length)
    }
  })

  it('gives every idea the full field set the UI renders', () => {
    for (const idea of ideas) {
      for (const key of [
        'title',
        'summary',
        'problem',
        'targetUsers',
        'difficulty',
        'technologies',
        'keyFeatures',
        'implementationSteps',
        'estimatedTime',
        'demoTips',
        'source',
        'derivedFrom',
      ]) {
        expect(idea, key).toHaveProperty(key)
      }
    }
  })

  it('does not return the problem statement twice under two field names', () => {
    // `summary` used to be a truncated copy of `problem`, so for every archetype
    // shorter than the 400-character cap the two fields were byte-identical and
    // the summary carried nothing the problem statement did not. A card needs
    // "what is this?" at a glance, which is a different question from "what hurts?".
    expect(ideas.length).toBeGreaterThan(0)
    for (const idea of ideas) {
      expect(idea.summary).toBeTruthy()
      expect(idea.summary).not.toBe(idea.problem)
    }
  })

  it('summary names who it is for and where the build starts', () => {
    // The audience phrase is embedded mid-sentence, so its leading capital is
    // dropped deliberately — compare case-insensitively.
    for (const idea of ideas) {
      expect(idea.summary).toContain(idea.difficulty)
      expect(idea.summary).toMatch(new RegExp(escapeRegExp(idea.targetUsers).slice(0, 24), 'i'))
    }
  })

  it('summary uses the right article for each difficulty it produces', () => {
    // "a beginner" is wrong; only vowel-initial takes "an".
    //
    // Several events are used because difficulty is varied around the level
    // inferred from the event, so which levels appear depends on what the event
    // actually published. Eligibility is the strongest lever: an event that
    // welcomes beginners infers `beginner` and so yields mostly beginner and
    // intermediate concepts, while one demanding prior experience infers
    // `advanced`. Asserting against a single fixture would leave the "an"
    // branch untested.
    const events = [
      event({ themes: ['AI', 'Machine Learning'], eligibility: null }),
      event({ themes: ['AI', 'Machine Learning', 'Robotics'], eligibility: 'Requires prior experience.' }),
      event({ themes: ['AI'], eligibility: 'Open to all. No prior experience required.' }),
    ]
    for (const source of events) {
      const produced = generateIdeas(source, { count: 9 })
      expect(produced.length, source.eligibility).toBeGreaterThan(0)
      for (const idea of produced) {
        const expected = /^[aeiou]/i.test(idea.difficulty) ? `An ${idea.difficulty}` : `A ${idea.difficulty}`
        expect(idea.summary, `${source.eligibility} / ${idea.difficulty}`).toContain(expected)
      }
    }
  })

  it('covers every difficulty level across one batch, so the article rule is fully tested', () => {
    const seen = new Set(
      generateIdeas(
        event({ themes: ['AI', 'Machine Learning', 'Robotics'], eligibility: null }),
        { count: 9 },
      ).map((idea) => idea.difficulty),
    )
    expect([...seen].sort()).toEqual([...DIFFICULTIES].sort())
  })

  it('summary preserves acronyms in the audience description', () => {
    // A blanket toLowerCase() renders "SaaS tools" as "saas tools", which reads
    // as a typo rather than a product name.
    const all = generateIdeas(event(), { count: 12 })
    expect(all.length).toBeGreaterThan(0)
    for (const idea of all) {
      // Only the audience phrase is decapitalised, so any remaining capitalised
      // acronym must have survived intact rather than been lower-cased.
      const audience = idea.targetUsers.slice(0, 24)
      expect(idea.summary).toMatch(new RegExp(escapeRegExp(audience), 'i'))
      if (/\b(SaaS|AI|IoT|API)\b/.test(audience)) {
        expect(idea.summary, audience).toContain(audience.match(/\b(SaaS|AI|IoT|API)\b/)[0])
      }
    }
  })

  it('stamps every idea as rule-based so the UI can say so honestly', () => {
    expect(ideas.every((i) => i.source === 'rule-based')).toBe(true)
  })

  it('uses only real difficulty levels and matching time estimates', () => {
    for (const idea of ideas) {
      expect(DIFFICULTIES).toContain(idea.difficulty)
      expect(idea.estimatedTime).toBe(TIME_ESTIMATES[idea.difficulty])
    }
  })

  it('includes the technologies the source actually published', () => {
    for (const idea of ideas) {
      expect(idea.technologies).toContain('Python')
    }
  })

  it('never repeats a technology inside one stack', () => {
    for (const idea of ideas) {
      const lowered = idea.technologies.map((t) => t.toLowerCase())
      expect(new Set(lowered).size).toBe(lowered.length)
    }
  })

  it('records which published signals each idea came from', () => {
    for (const idea of ideas) {
      expect(idea.derivedFrom.category).toBe('artificial-intelligence')
      expect(idea.derivedFrom.themes).toEqual(['AI'])
    }
  })

  it('leaves no unfilled template placeholder in any text', () => {
    for (const idea of ideas) {
      const text = JSON.stringify(idea)
      expect(text, idea.title).not.toContain('{theme}')
    }
  })

  it('returns real prose, not lorem ipsum or placeholder text', () => {
    for (const idea of ideas) {
      expect(idea.problem.length).toBeGreaterThan(30)
      expect(idea.targetUsers.length).toBeGreaterThan(10)
      expect(idea.keyFeatures.length).toBeGreaterThanOrEqual(3)
      expect(idea.implementationSteps.length).toBeGreaterThanOrEqual(3)
      expect(idea.demoTips.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('never promises a prize or a guaranteed place', () => {
    const banned = /guarantee[ds]? (?:a )?(?:win|prize|selection)|will win|guaranteed prize/i
    for (const idea of generateIdeas(event(), { count: 6 })) {
      expect(JSON.stringify(idea), idea.title).not.toMatch(banned)
    }
  })
})

describe('generateIdeas — behaviour', () => {
  it('produces ideas from the archetype library for the event’s category', () => {
    const ai = generateIdeas(event({ category: 'artificial-intelligence' }), { count: 3 })
    const cyber = generateIdeas(event({ category: 'cybersecurity' }), { count: 2 })
    expect(ai.map((i) => i.title)).not.toEqual(cyber.map((i) => i.title))
  })

  it('falls back to a generic archetype for a category with no library', () => {
    const ideas = generateIdeas(event({ category: 'open-innovation' }), { count: 1 })
    expect(ideas).toHaveLength(1)
    expect(ideas[0].title.length).toBeGreaterThan(0)
  })

  it('handles a hackathon whose category is not in the taxonomy at all', () => {
    expect(() => generateIdeas(event({ category: 'space-tourism' }), { count: 3 })).not.toThrow()
  })

  it('is deterministic for the same inputs, so a shared URL shows the same ideas', () => {
    const a = generateIdeas(event(), { count: 3 })
    const b = generateIdeas(event(), { count: 3 })
    expect(a).toEqual(b)
  })

  it('changes what it returns when the offset is advanced, for "Regenerate"', () => {
    const first = generateIdeas(event(), { count: 3, offset: 0 })
    const second = generateIdeas(event(), { count: 3, offset: 1 })
    expect(second).not.toEqual(first)
  })

  it('spans more than one difficulty level rather than returning three of a kind', () => {
    const levels = new Set(generateIdeas(event(), { count: 6 }).map((i) => i.difficulty))
    expect(levels.size).toBeGreaterThan(1)
  })

  it('varies the suggested stack across ideas', () => {
    const stacks = generateIdeas(event(), { count: 3 }).map((i) => i.technologies.join(','))
    expect(new Set(stacks).size).toBeGreaterThan(1)
  })

  it('respects the count argument', () => {
    for (const count of [1, 2, 3]) {
      expect(generateIdeas(event(), { count })).toHaveLength(count)
    }
  })

  it('returns no more concepts than the archetype library can actually produce', () => {
    // Asking for six from a one-theme track must not fabricate near-duplicates.
    const ideas = generateIdeas(event(), { count: 6 })
    expect(ideas.length).toBeLessThanOrEqual(availableConceptCount(event()))
  })

  it('never returns an empty panel when a difficulty filter matches nothing', () => {
    const ideas = generateIdeas(event(), { count: 3, difficulty: ['advanced'] })
    expect(ideas.length).toBeGreaterThan(0)
  })

  it('never returns an empty panel when a technology filter matches nothing', () => {
    const ideas = generateIdeas(event(), { count: 3, technologies: ['COBOL'] })
    expect(ideas.length).toBeGreaterThan(0)
  })

  it('narrows the result set when a technology filter does match', () => {
    const ideas = generateIdeas(event(), { count: 6, technologies: ['python'] })
    expect(ideas.length).toBeGreaterThan(0)
    for (const idea of ideas) {
      expect(idea.technologies.map((t) => t.toLowerCase())).toContain('python')
    }
  })

  it('works on an event with no themes, technologies or category', () => {
    const ideas = generateIdeas(
      { title: 'Mystery Event', description: '', themes: null, technologies: null, category: null },
      { count: 2 },
    )
    expect(ideas.length).toBeGreaterThan(0)
    for (const idea of ideas) expect(idea.title).not.toContain('undefined')
  })
})

describe('availableConceptCount', () => {
  it('reports a finite number rather than pretending to be unlimited', () => {
    const count = availableConceptCount(event())
    expect(Number.isInteger(count)).toBe(true)
    expect(count).toBeGreaterThan(0)
    expect(count).toBeLessThanOrEqual(24)
  })

  it('grows with the number of published themes', () => {
    expect(availableConceptCount(event({ themes: ['A', 'B', 'C'] }))).toBeGreaterThan(
      availableConceptCount(event({ themes: ['A'] })),
    )
  })
})

describe('ideaToText', () => {
  const idea = generateIdeas(event(), { count: 1 })[0]

  it('renders every section the UI promises', () => {
    const text = ideaToText(idea, event())
    expect(text).toContain(idea.title)
    expect(text).toContain('Problem:')
    expect(text).toContain('Target users:')
    expect(text).toContain('Difficulty:')
    expect(text).toContain('Suggested stack:')
    expect(text).toContain('Key features:')
    expect(text).toContain('Implementation steps:')
    expect(text).toContain('How to demo it:')
  })

  it('names the event it was generated for', () => {
    expect(ideaToText(idea, event())).toContain('Smart India Hackathon 2026')
  })

  it('says "organiser not published" rather than printing "undefined"', () => {
    expect(ideaToText(idea, { title: 'X', organizer: null })).toContain('organiser not published')
  })

  it('states plainly that the suggestion is not a guarantee', () => {
    const text = ideaToText(idea, event())
    expect(text).toMatch(/not a guarantee of selection/i)
    expect(text).toMatch(/not an official requirement/i)
  })

  it('labels an AI-generated idea differently from a rule-based one', () => {
    const text = ideaToText({ ...idea, source: 'ai' }, event())
    expect(text).toMatch(/generated by ai/i)
  })

  it('works without an event at all', () => {
    expect(() => ideaToText(idea, null)).not.toThrow()
    expect(ideaToText(idea, null)).toContain(idea.title)
  })

  it('tolerates missing optional sections', () => {
    const sparse = { ...idea, implementationSteps: [], demoTips: [], technologies: [] }
    expect(() => ideaToText(sparse, event())).not.toThrow()
  })
})