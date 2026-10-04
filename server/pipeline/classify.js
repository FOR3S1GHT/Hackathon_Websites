import { CATEGORIES, TECHNOLOGIES } from '../../shared/taxonomy.js'
import { cleanTagList } from '../lib/text.js'

/**
 * Derives `category`, `technologies` and `themes` from whatever the source
 * actually published. Nothing is invented: if a hackathon's text mentions no
 * recognisable technology, `technologies` stays empty rather than being padded
 * with plausible guesses.
 */

/**
 * Keyword matcher compiled once per keyword.
 *
 * Substring matching would be badly wrong for short keywords: "ui" matches
 * "build", "guide" and "require"; "ar" matches "start" and "share"; "vr"
 * matches "over". Word-boundary matching removes those false positives while
 * still allowing multi-word keywords such as "machine learning".
 *
 * C++-style keywords ("c++", "c#") need an explicit boundary, so they are
 * compiled with escaped characters and no trailing word-boundary assertion.
 */
function compileKeyword(keyword) {
  const escaped = keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const special = /[+#]/.test(escaped)
  const leading = /^[a-z0-9]/.test(escaped) ? '\\b' : ''
  const trailing = /[a-z0-9]$/.test(escaped) ? '\\b' : ''
  return {
    needle: keyword.toLowerCase(),
    regex: new RegExp(`${leading}${escaped}${trailing}`, 'i'),
    special,
  }
}

const KEYWORD_INDEX = new Map()
for (const category of CATEGORIES) {
  KEYWORD_INDEX.set(
    category.key,
    category.keywords.map(compileKeyword),
  )
}

const TECH_PATTERNS = TECHNOLOGIES.map((tech) => {
  const escaped = tech.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const alias = tech.aliases?.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) ?? []
  const all = [escaped, ...alias]
  // Single- and double-character labels ("C", "R", "C#") are matched
  // case-sensitively, otherwise the pattern matches every stray "c" in prose.
  const caseSensitive = tech.label.length <= 2
  const pattern = new RegExp(
    `(^|[^a-z0-9+#])(${all.join('|')})([^a-z0-9+]|$)`,
    caseSensitive ? '' : 'i',
  )
  return { key: tech.key, label: tech.label, pattern }
})

/** Text blobs the classifier reads, in descending order of authority. */
function buildHaystack(hackathon) {
  return [
    ...toTokens(hackathon.themes),
    ...toTokens(hackathon.technologies),
    hackathon.category,
    hackathon.title,
    hackathon.summary,
    hackathon.description,
    hackathon.judgingCriteria,
    hackathon.eligibility,
  ]
    .map(str)
    .filter(Boolean)
    .join(' \n ')
    .toLowerCase()
}

/**
 * Coerce a tag-ish field into an array of strings.
 *
 * A connector may hand us a bare string where an array is expected; without
 * this, `themes.join` on a string throws and takes the entire sync run down.
 */
function toTokens(value) {
  if (Array.isArray(value)) return value.map(str)
  if (typeof value === 'string') return [value]
  return []
}

/**
 * Coerce anything to a trimmed string.
 *
 * Source payloads are not validated before they reach here, and a single record
 * with `title: 20301` or `description: { html: "…" }` would otherwise throw and
 * take down the whole sync run. Returning "" for non-primitives is the honest
 * reading of "there is no text here to classify from".
 */
function str(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

/** Lowercased, length-capped body text. */
function text(value, cap = 4000) {
  return str(value).slice(0, cap).toLowerCase()
}

export function extractTechnologies(hackathon = {}) {
  // Preserve the source's own tags verbatim — they are higher quality than
  // anything we could infer.
  const declared = cleanTagList(hackathon.technologies, { max: 8 })
  const haystack = buildHaystack({ ...hackathon, technologies: [] })
  const inferred = []
  for (const { label, pattern } of TECH_PATTERNS) {
    if (pattern.test(haystack)) inferred.push(label)
  }
  const merged = []
  for (const item of [...inferred, ...declared]) {
    if (!merged.some((m) => m.toLowerCase() === item.toLowerCase())) merged.push(item)
  }
  return merged.slice(0, 14)
}

/**
 * Pick exactly one primary category using a weighted vote: themes (source's own
 * categorisation) weigh most, then title, then body text.
 */
export function classifyCategory(hackathon = {}) {
  const themes = toTokens(hackathon.themes).join(' ').toLowerCase()
  const title = text(hackathon.title)
  const summary = text(hackathon.summary)
  const body = text(hackathon.description)
  const declared = text(hackathon.category, 60)

  const scores = new Map()

  const add = (key, amount) => {
    if (!key) return
    scores.set(key, (scores.get(key) ?? 0) + amount)
  }

  for (const category of CATEGORIES) {
    for (const keyword of KEYWORD_INDEX.get(category.key)) {
      if (keyword.regex.test(themes)) add(category.key, 6)
      if (keyword.regex.test(title)) add(category.key, 5)
      if (keyword.regex.test(summary)) add(category.key, 3)
      if (keyword.regex.test(body)) add(category.key, 1)
    }
    for (const pattern of category.patterns) {
      if (pattern.test(themes)) add(category.key, 6)
      if (pattern.test(title)) add(category.key, 5)
      if (pattern.test(summary)) add(category.key, 3)
      if (pattern.test(body)) add(category.key, 1)
    }
  }

  // The source's own declared category (e.g. Devpost theme name) is strong evidence.
  for (const category of CATEGORIES) {
    if (declared === category.key) add(category.key, 10)
    else if (KEYWORD_INDEX.get(category.key).some((k) => k.regex.test(declared))) {
      add(category.key, 4)
    }
  }

  // Break ties deterministically by taxonomy order so classification is stable.
  let best = null
  let bestScore = 0
  for (const category of CATEGORIES) {
    const score = scores.get(category.key) ?? 0
    if (score > bestScore) {
      best = category.key
      bestScore = score
    }
  }

  return best ?? 'open-innovation'
}

/** Extract themes, preferring what the source published. */
export function extractThemes(hackathon) {
  const declared = cleanTagList(hackathon.themes, { max: 12, maxLength: 48 })
  if (declared.length) return declared

  const body = `${str(hackathon.title)} ${str(hackathon.summary)}`
  const found = []
  for (const category of CATEGORIES) {
    for (const keyword of category.keywords) {
      if (keyword.length < 4) continue
      if (new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(body)) {
        found.push(keyword)
        break
      }
    }
    if (found.length >= 6) break
  }
  return found.slice(0, 8)
}

/**
 * `beginnerFriendly` is only true when the source says so, or when eligibility
 * explicitly welcomes students / first-time participants. We never guess.
 */
export function detectBeginnerFriendly(hackathon) {
  const text_ = `${str(hackathon.eligibility)} ${str(hackathon.summary)} ${str(hackathon.description)}`
  if (!text_.trim()) return null
  return /beginner|no prior experience|prior experience (?:is )?(?:not|n't) required|first[\s-]time|for students|undergrad|open to all|no experience/i.test(
    text_,
  )
    ? true
    : null
}

/** Normalise an event format from whatever the source calls it. */
export function normaliseFormat({ format, location, isOnline, region } = {}) {
  const candidates = [format, isOnline === true ? 'online' : null, isOnline === false ? 'offline' : null, region, location]
  for (const candidate of candidates) {
    if (!candidate) continue
    const value = String(candidate).toLowerCase()
    if (/hybr/.test(value)) return 'hybrid'
    if (/\bonline\b|virtual|remote|\bonline only\b|internet/i.test(value)) return 'online'
    if (/offline|in[\s-]?person|on[\s-]?site|onsite|physical|campus|physical event/i.test(value)) return 'offline'
  }
  return 'unknown'
}

/** Best-effort country extraction from free-text locations. */
const COUNTRY_HINTS = [
  ['india', 'India'], ['united states', 'United States'], ['usa', 'United States'], ['u.s.', 'United States'],
  ['united kingdom', 'United Kingdom'], ['uk', 'United Kingdom'], ['canada', 'Canada'], ['australia', 'Australia'],
  ['germany', 'Germany'], ['france', 'France'], ['spain', 'Spain'], ['italy', 'Italy'], ['netherlands', 'Netherlands'],
  ['singapore', 'Singapore'], ['japan', 'Japan'], ['south korea', 'South Korea'], ['korea', 'South Korea'],
  ['china', 'China'], ['brazil', 'Brazil'], ['mexico', 'Mexico'], ['nigeria', 'Nigeria'], ['kenya', 'Kenya'],
  ['south africa', 'South Africa'], ['egypt', 'Egypt'], ['uae', 'United Arab Emirates'],
  ['united arab emirates', 'United Arab Emirates'], ['dubai', 'United Arab Emirates'], ['qatar', 'Qatar'],
  ['saudi arabia', 'Saudi Arabia'], ['indonesia', 'Indonesia'], ['malaysia', 'Malaysia'], ['philippines', 'Philippines'],
  ['vietnam', 'Vietnam'], ['thailand', 'Thailand'], ['turkey', 'Türkiye'], ['turkiye', 'Türkiye'],
  ['israel', 'Israel'], ['ireland', 'Ireland'], ['sweden', 'Sweden'], ['norway', 'Norway'], ['denmark', 'Denmark'],
  ['finland', 'Finland'], ['poland', 'Poland'], ['portugal', 'Portugal'], ['switzerland', 'Switzerland'],
  ['austria', 'Austria'], ['belgium', 'Belgium'], ['greece', 'Greece'], ['romania', 'Romania'], ['ukraine', 'Ukraine'],
  ['russia', 'Russia'], ['pakistan', 'Pakistan'], ['bangladesh', 'Bangladesh'], ['sri lanka', 'Sri Lanka'],
  ['argentina', 'Argentina'], ['chile', 'Chile'], ['colombia', 'Colombia'], ['peru', 'Peru'],
  ['new zealand', 'New Zealand'], ['hong kong', 'Hong Kong'], ['taiwan', 'Taiwan'], ['puerto rico', 'Puerto Rico'],
  ['argentina', 'Argentina'], ['morocco', 'Morocco'], ['ghana', 'Ghana'], ['tanzania', 'Tanzania'],
]

export function detectCountry({ country, location, address } = {}) {
  if (country && String(country).trim()) return String(country).trim()
  const haystack = `${str(address)} ${str(location)}`.toLowerCase()
  if (!haystack.trim()) return null
  for (const [needle, name] of COUNTRY_HINTS) {
    if (haystack.includes(needle)) return name
  }
  return null
}

/** Full enrichment pass applied to every normalised record before storage. */
export function enrich(hackathon) {
  const technologies = extractTechnologies(hackathon)
  const category = classifyCategory({ ...hackathon, technologies })
  return {
    ...hackathon,
    technologies,
    category,
    themes: extractThemes(hackathon),
    beginnerFriendly: detectBeginnerFriendly(hackathon),
    country: hackathon.country ?? detectCountry(hackathon),
  }
}
