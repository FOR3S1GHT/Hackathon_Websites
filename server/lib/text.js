/** Text sanitisation + normalisation helpers shared by sources and API routes. */

const HTML_ESCAPES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&nbsp;': ' ',
  '&mdash;': '—',
  '&ndash;': '–',
  '&hellip;': '…',
  '&rsquo;': '’',
  '&lsquo;': '‘',
  '&ldquo;': '“',
  '&rdquo;': '”',
}

export function decodeEntities(input) {
  if (!input) return ''
  let out = String(input)
  // Numeric entities first.
  out = out.replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeChar(parseInt(hex, 16)))
  out = out.replace(/&#(\d+);/g, (_, dec) => safeChar(parseInt(dec, 10)))
  out = out.replace(/&[a-z]+;/gi, (m) => HTML_ESCAPES[m.toLowerCase()] ?? m)
  return out
}

function safeChar(code) {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return ''
  try {
    return String.fromCodePoint(code)
  } catch {
    return ''
  }
}

const BLOCK_TAGS = /<\/(p|div|section|article|li|ul|ol|tr|h[1-6]|blockquote|pre)>/gi

/** Strip tags but keep readable text. Never used for rendering HTML. */
export function htmlToText(html, { maxLength = 0 } = {}) {
  if (!html) return ''
  let text = String(html)
  text = text.replace(/<script[\s\S]*?<\/script>/gi, ' ')
  text = text.replace(/<style[\s\S]*?<\/style>/gi, ' ')
  text = text.replace(/<!--[\s\S]*?-->/g, ' ')
  text = text.replace(/<br\s*\/?>/gi, '\n')
  text = text.replace(BLOCK_TAGS, '\n')
  text = text.replace(/<li[^>]*>/gi, '• ')
  text = text.replace(/<[^>]+>/g, ' ')
  text = decodeEntities(text)
  text = text.replace(/\r/g, '')
  // Collapses runs of spaces, tabs and the exotic space characters (U+00A0
  // non-breaking, U+2009 thin). Those are written as escapes on purpose: an
  // invisible literal inside a character class is unreadable, and `trim()` does
  // not remove NBSP either, so it is normalised to a real space here.
  text = text.replace(/[ \t\u00a0\u2009]+/g, ' ')
  text = text.replace(/ *\n */g, '\n')
  text = text.replace(/\n{3,}/g, '\n\n')
  text = text.trim()
  if (maxLength > 0 && text.length > maxLength) {
    text = `${text.slice(0, maxLength).replace(/\s+\S*$/, '')}…`
  }
  return text
}

/** Strip every HTML tag with no decoding — used before storing raw-ish text. */
export function stripTags(input) {
  if (!input) return ''
  return String(input)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Very small allow-list sanitiser for description fields.
 *
 * HackRadar renders organizer-supplied descriptions as *text*, never as raw
 * HTML, so this is defence in depth rather than the primary protection: it
 * removes script/style/event-handler payloads so nothing dangerous survives
 * into the JSON store even if a future template renders it.
 */
export function sanitizeHtml(input) {
  if (!input) return ''
  return String(input)
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|form)[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|form)\b[^>]*\/?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '')
    .trim()
}

/** URL-safe slug. Always returns a non-empty string. */
export function slugify(input, fallback = 'event') {
  const base = String(input || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')
  return base || fallback
}

/** Only allow http(s). Anything else (javascript:, data:) becomes null. */
export function safeUrl(input) {
  if (!input) return null
  const raw = String(input).trim()
  if (!raw) return null
  const candidate = raw.startsWith('//') ? `https:${raw}` : raw
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.toString()
  } catch {
    return null
  }
}

/** Normalise protocol-relative URLs (Devpost returns `//host/path`). */
export function normaliseImageUrl(input) {
  if (!input) return null
  const raw = String(input).trim()
  if (!raw) return null
  if (raw.startsWith('//')) return `https:${raw}`
  return safeUrl(raw)
}

export function truncate(input, max = 220) {
  const text = String(input || '').trim()
  if (text.length <= max) return text
  return `${text.slice(0, max).replace(/\s+\S*$/, '')}…`
}

export function titleCase(input) {
  return String(input || '')
    .split(/\s+/)
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ')
}

const NOISE_WORDS = new Set([
  'hackathon', 'hack', 'the', 'a', 'an', 'and', 'of', 'for', 'in', 'at', 'on', 'to',
  '2024', '2025', '2026', '2027', '2028', 'edition', 'season', 'round', 'global',
])

/** Words used for fuzzy cross-source duplicate detection. */
export function titleTokens(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !NOISE_WORDS.has(w) && !/^\d+$/.test(w))
}

export function tokenSet(input) {
  return new Set(titleTokens(input))
}

export function jaccard(a, b) {
  if (!a.size || !b.size) return 0
  let intersection = 0
  for (const item of a) if (b.has(item)) intersection += 1
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

/** Remove duplicate objects by a key function, keeping the first occurrence. */
export function uniqueBy(items, keyFn) {
  const seen = new Set()
  const out = []
  for (const item of items) {
    const key = keyFn(item)
    if (key === null || key === undefined) continue
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

export function toNumber(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const cleaned = String(value).replace(/[^0-9.]/g, '')
  const n = Number.parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

export function toBoolean(value) {
  if (typeof value === 'boolean') return value
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return value !== 0
  const v = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'y', 'open', 'active', 'published'].includes(v)) return true
  if (['0', 'false', 'no', 'n', 'closed', 'inactive', 'draft', 'past'].includes(v)) return false
  return null
}

/** Bounded array of short, cleaned, lowercase-free strings. */
export function cleanTagList(input, { max = 20, maxLength = 40 } = {}) {
  const arr = Array.isArray(input) ? input : input ? [input] : []
  const out = []
  for (const raw of arr) {
    if (raw === null || raw === undefined) continue
    const value = typeof raw === 'string' ? raw : raw?.name || raw?.title || raw?.label || ''
    const cleaned = stripTags(decodeEntities(String(value))).replace(/^#/, '').trim()
    if (!cleaned || cleaned.length > maxLength) continue
    if (!out.some((t) => t.toLowerCase() === cleaned.toLowerCase())) out.push(cleaned)
    if (out.length >= max) break
  }
  return out
}

/** Cap any string coming from an external source. */
/**
 * Is this line real prose rather than scaffolding?
 *
 * Callers use this to pick the first sentence worth showing as a summary.
 */
export function isProseLine(line) {
  const text = String(line ?? '').trim()
  if (!text) return false
  if (/^[•*\-–—]\s/.test(text)) return false
  if (/^[\w\s&'()-]{2,60}:$/.test(text)) return false
  return true
}

/**
 * Does this text contain a usable descriptive paragraph?
 *
 * Several sources publish descriptions that are *only* section headings and
 * rules lists ("Guidelines:", "• Team size: 1–4 members"). Slicing one of those
 * into a card summary produces something that reads like a form, so the text has
 * to contain at least one genuinely descriptive line first.
 *
 * The judgement is per line rather than per document, because a real listing
 * often opens with a paragraph and then devotes most of its length to rules. The
 * opening is what a summary is drawn from, so the tail does not disqualify it.
 *
 * The 12-word floor is measured against real listings rather than guessed. A
 * genuine one-liner from Unstop reads "Prompt-e-Thon is a premier three-stage
 * hackathon combining Ideation, AI-powered Vibe Coding, Mentorship, and Prototype
 * Development." — 15 words. Meanwhile the things this filter has to reject, the
 * title echoes and round headings, are 6 to 8 words. So 12 sits in the gap.
 */
export function hasDescriptiveProse(text, { minWords = 12 } = {}) {
  if (!text) return false
  return String(text)
    .split('\n')
    .some((line) => isProseLine(line) && line.trim().split(/\s+/).length >= minWords)
}

export function clampString(input, max = 2000) {
  if (input === null || input === undefined) return null
  const s = String(input).trim()
  if (!s) return null
  return s.length > max ? s.slice(0, max) : s
}
