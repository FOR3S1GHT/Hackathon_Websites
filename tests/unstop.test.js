/**
 * Unstop connector parsing, tested against the *real* payload shapes.
 *
 * Every case here is a bug that was live in the pipeline:
 *
 *  - `required_skills` are keyed `skill_name`, not `name`, so every Unstop
 *    hackathon was stored with zero technologies;
 *  - `filters` are audience facets, not themes, so every Indian event was
 *    classified as though it had published "Law" and "Management" as its
 *    subject matter;
 *  - several listings publish *only* rules, so the card summary was a wall of
 *    "Guidelines: • Eligibility: Open to all undergraduate…".
 *
 * The fixtures below are trimmed from live API responses rather than invented,
 * because the whole point of the assertions is that they match the wire format.
 */
import { describe, expect, it } from 'vitest'

import {
  audienceFilters,
  eligibilityLevelFromAudience,
  isScaffolding,
  skillNames,
  summarise,
} from '@server/sources/unstop.js'
import { hasDescriptiveProse, htmlToText, isProseLine } from '@server/lib/text.js'

/** A real `required_skills` entry, including the AI-tagging pivot. */
const SKILLS = [
  { id: 645580, skill: 'Artificial Intelligence (AI)', skill_name: 'Artificial Intelligence (AI)', pivot: { ai_generated: true } },
  { id: 646358, skill: 'Ideation', skill_name: 'Ideation', pivot: { ai_generated: true } },
  { id: 645273, skill: 'UI/UX Prototyping', skill_name: 'UI/UX Prototyping', pivot: { ai_generated: true } },
]

/** A real `filters` array — every entry is `type: 'eligible'`. */
const FILTERS = [
  { id: 422, name: 'Engineering Students', type: 'eligible' },
  { id: 424, name: 'Postgraduate', type: 'eligible' },
  { id: 426, name: 'Undergraduate', type: 'eligible' },
  { id: 4022, name: 'Management', type: 'eligible' },
]

describe('skillNames', () => {
  it('reads Unstop skill_name, which cleanTagList cannot', () => {
    // The bug: passing these objects to cleanTagList yielded [], because it
    // looks for `name`/`title`/`label` and Unstop uses `skill_name`.
    expect(skillNames(SKILLS)).toEqual([
      'Artificial Intelligence (AI)',
      'Ideation',
      'UI/UX Prototyping',
    ])
  })

  it('accepts bare strings and the alternate key spellings', () => {
    expect(skillNames(['Python', { skill: 'Go' }, { name: 'Rust' }])).toEqual(['Python', 'Go', 'Rust'])
  })

  it('drops entries with no usable name rather than emitting "null"', () => {
    expect(skillNames([{}, null, { skill_name: '' }, { skill_name: 'Node.js' }])).toEqual(['Node.js'])
  })

  it('returns an empty list for anything that is not an array', () => {
    expect(skillNames(undefined)).toEqual([])
    expect(skillNames(null)).toEqual([])
    expect(skillNames('Python')).toEqual([])
    expect(skillNames({})).toEqual([])
  })
})

describe('audienceFilters', () => {
  it('keeps only eligibility facets', () => {
    expect(audienceFilters(FILTERS)).toEqual([
      'Engineering Students',
      'Postgraduate',
      'Undergraduate',
      'Management',
    ])
  })

  it('never returns topics: "Law" is not a subject area', () => {
    // The bug: these went into `themes`, so the classifier read "Management" and
    // "Law" as subject matter on every Unstop event.
    const audience = audienceFilters(FILTERS)
    expect(audience).not.toContain('themes')
    expect(
      audience.every((t) => /students|undergraduate|postgraduate|management|fresher|professional/i.test(t)),
    ).toBe(true)
  })

  it('excludes non-eligible filter types', () => {
    expect(
      audienceFilters([
        { name: 'Artificial Intelligence', type: 'domain' },
        { name: 'Fresher', type: 'eligible' },
      ]),
    ).toEqual(['Fresher'])
  })

  it('tolerates missing and non-array input', () => {
    expect(audienceFilters(undefined)).toEqual([])
    expect(audienceFilters([{}, { type: 'eligible' }])).toEqual([])
  })
})

describe('eligibilityLevelFromAudience', () => {
  it('returns null when the audience says nothing about seniority', () => {
    // Honesty rule: never guess a level from an audience that does not state one.
    expect(eligibilityLevelFromAudience(FILTERS.map((f) => f.name))).toBeNull()
    expect(eligibilityLevelFromAudience([])).toBeNull()
    expect(eligibilityLevelFromAudience(undefined)).toBeNull()
  })

  it('reads an explicitly open audience as open', () => {
    expect(eligibilityLevelFromAudience(['Open to All'])).toBe('open')
    expect(eligibilityLevelFromAudience(['Anyone'])).toBe('open')
    expect(eligibilityLevelFromAudience(['No Restriction'])).toBe('open')
  })

  it('reads an experienced-professionals-only audience as advanced', () => {
    expect(eligibilityLevelFromAudience(['Experienced Professionals'])).toBe('advanced')
    expect(eligibilityLevelFromAudience(['Working Professionals only'])).toBe('advanced')
  })

  it('reads a fresher/first-year audience as beginner', () => {
    expect(eligibilityLevelFromAudience(['Fresher'])).toBe('beginner')
    expect(eligibilityLevelFromAudience(['First Year Students'])).toBe('beginner')
  })

  it('does not call a mixed audience advanced just because "Experienced" appears', () => {
    // A menu of options is not a restriction. Marking this advanced would filter
    // an event out of "beginner friendly" for no reason the source stated.
    const mixed = ['Experienced Professionals', 'Engineering Students', 'Fresher']
    expect(eligibilityLevelFromAudience(mixed)).not.toBe('advanced')
  })

  it('does not call a mixed audience beginner either', () => {
    // Equally, "freshers may enter" is not "this is an easy beginner event".
    expect(eligibilityLevelFromAudience(['Experienced Professionals', 'Fresher'])).toBeNull()
  })
})

describe('isScaffolding', () => {
  it('rejects bulleted rules items', () => {
    expect(isScaffolding('• Team size: 1–4 members per team.')).toBe(true)
    expect(isScaffolding('- Eligibility')).toBe(true)
  })

  it('rejects bare and short trailing-colon headings', () => {
    expect(isScaffolding('Guidelines:')).toBe(true)
    expect(isScaffolding('Round 1: Drone Soccer Arena Showdown:')).toBe(true)
    expect(isScaffolding('Online Round: Portfolio Building & Analysis:')).toBe(true)
  })

  it('rejects a short colon-led label followed by a sentence', () => {
    expect(isScaffolding('Eligibility: Open to all undergraduate students.')).toBe(true)
    expect(isScaffolding('Team Formation: Teams may have two to four members.')).toBe(true)
  })

  it('rejects fragments too short to be a summary', () => {
    expect(isScaffolding('Craft N Code – West Bengal State Qualifier')).toBe(true)
  })

  it('accepts a real sentence', () => {
    expect(
      isScaffolding(
        'AZINHACK is a 24-hour flagship hackathon organised by IoSC, GGSIPU East Delhi Campus.',
      ),
    ).toBe(false)
  })

  it('accepts prose that merely contains a colon', () => {
    // The regression this guards: bounding the label pattern by characters
    // instead of words swallowed this sentence and dropped good descriptions.
    expect(
      isScaffolding(
        'Techkriti presents Code N Compete: a high-intensity competitive programming challenge.',
      ),
    ).toBe(false)
    expect(isScaffolding('Bring your team: we provide GPUs and API credits for all of you.')).toBe(false)
  })
})

describe('summarise', () => {
  it('prefers the first real paragraph over the leading heading', () => {
    const html =
      '<p><strong>About the Event:</strong></p>' +
      '<p><strong>Prompt-e-Thon</strong> is a premier three-stage hackathon combining Ideation, AI-powered Vibe Coding, Mentorship, and Prototype Development.</p>'
    const summary = summarise(htmlToText(html))
    expect(summary).toMatch(/^Prompt-e-Thon is a premier three-stage hackathon/)
    expect(summary).not.toMatch(/About the Event/)
  })

  it('returns null when the organiser published only rules', () => {
    // Real CodeStorm 2026 payload: every section is a heading plus bullets.
    const html =
      '<p><strong>Guidelines:</strong></p>' +
      '<ul><li>Eligibility: Open to all undergraduate and postgraduate students across India.</li>' +
      '<li>Team Formation:</li><li>Inter-college team members are allowed.</li></ul>' +
      '<p><strong>Rules:</strong></p><ul><li>All submissions must be original work of the team.</li></ul>' +
      '<p><strong>Rewards:</strong></p><ul><li>Top 3 teams: Excellence Certificates.</li></ul>'
    expect(summarise(htmlToText(html))).toBeNull()
  })

  it('keeps a good opening paragraph even when most of the listing is rules', () => {
    // The regression this guards: measuring prose across the whole document made
    // every listing look rule-dominated, and nulled real descriptions.
    const html =
      '<p><strong>About the Event:</strong></p>' +
      '<p>IARC is an autonomous robot competition where participants build a working robot from scratch and it is judged on design, build quality and performance.</p>' +
      '<p><strong>Rules:</strong></p>' +
      '<ul><li>Rule one.</li><li>Rule two.</li><li>Rule three.</li><li>Rule four.</li>' +
      '<li>Rule five.</li><li>Rule six.</li></ul>'
    expect(summarise(htmlToText(html))).toMatch(/^IARC is an autonomous robot competition/)
  })

  it('does not fall back to repeating the title as the blurb', () => {
    const html = '<p>Craft N Code – West Bengal State Qualifier</p>'
    expect(summarise(htmlToText(html))).toBeNull()
  })

  it('never returns a summary longer than the card allows', () => {
    const long = `<p>${'This is a genuinely descriptive sentence about the event. '.repeat(40)}</p>`
    const summary = summarise(htmlToText(long))
    expect(summary.length).toBeLessThanOrEqual(241)
    expect(summary.endsWith('…')).toBe(true)
  })

  it('handles empty and null input', () => {
    expect(summarise('')).toBeNull()
    expect(summarise(null)).toBeNull()
  })
})

describe('text: prose detection', () => {
  it('isProseLine separates sentences from scaffolding', () => {
    expect(isProseLine('Guidelines:')).toBe(false)
    expect(isProseLine('• Eligibility: Open to all')).toBe(false)
    expect(isProseLine('A 24-hour hackathon organised by a student club in Delhi.')).toBe(true)
    expect(isProseLine('')).toBe(false)
    expect(isProseLine(null)).toBe(false)
  })

  it('hasDescriptiveProse rejects the title echoes and round headings it must reject', () => {
    // Both are under the 12-word floor and would otherwise pass as summaries.
    expect(hasDescriptiveProse('Craft N Code – West Bengal State Qualifier')).toBe(false)
    expect(hasDescriptiveProse('Round 1: Drone Soccer Arena Showdown:')).toBe(false)
  })

  it('hasDescriptiveProse accepts a real 15-word one-liner from a live listing', () => {
    // The floor is 12, not 20, precisely because this exists in the wild.
    expect(
      hasDescriptiveProse(
        'Prompt-e-Thon is a premier three-stage hackathon combining Ideation, AI-powered Vibe Coding, Mentorship, and Prototype Development.',
      ),
    ).toBe(true)
  })

  it('hasDescriptiveProse is false for empty input', () => {
    expect(hasDescriptiveProse('')).toBe(false)
    expect(hasDescriptiveProse(null)).toBe(false)
    expect(hasDescriptiveProse('   \n  ')).toBe(false)
  })
})