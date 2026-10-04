/**
 * Client-side formatting helpers.
 *
 * These mirror server/lib/dates.js semantics but are deliberately independent —
 * the client formats timestamps it receives without a round trip.
 */

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

export const CURRENCY_SYMBOLS = {
  USD: '$', EUR: '€', GBP: '£', INR: '₹', JPY: '¥', CAD: 'C$', AUD: 'A$',
  SGD: 'S$', CNY: '¥', BRL: 'R$', ZAR: 'R', AED: 'AED ', NGN: '₦', KRW: '₩',
}

export function formatDate(value, { withYear = true } = {}) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const base = `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`
  return withYear ? `${base} ${date.getUTCFullYear()}` : base
}

export function formatDateRange(start, end, { withYear = true } = {}) {
  if (!start && !end) return null
  if (start && !end) return formatDate(start, { withYear })
  if (!start && end) return formatDate(end, { withYear })
  const a = new Date(start)
  const b = new Date(end)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return formatDate(start, { withYear })
  const sameDay = a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10)
  if (sameDay) return formatDate(start, { withYear })
  const sameYear = a.getUTCFullYear() === b.getUTCFullYear()
  const left = formatDate(start, { withYear: !sameYear })
  return `${left} – ${formatDate(end, { withYear })}`
}

export function formatMoney(amount, currency) {
  if (amount === null || amount === undefined) return null
  const value = Number(amount)
  if (!Number.isFinite(value) || value <= 0) return null
  const symbol = CURRENCY_SYMBOLS[currency] ?? (currency ? `${currency} ` : '')
  if (value >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`
  if (value >= 1_000) return `${symbol}${Math.round(value / 1_000)}K`
  return `${symbol}${Math.round(value)}`
}

export function formatPrize(amount, currency) {
  const formatted = formatMoney(amount, currency)
  return formatted ? `${formatted} prize pool` : null
}

export function relativeTime(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const seconds = Math.round((Date.now() - date.getTime()) / 1000)
  if (seconds < 45) return 'just now'
  const units = [
    [60, 'second', 1],
    [3600, 'minute', 60],
    [86_400, 'hour', 3600],
    [604_800, 'day', 86_400],
    [2_629_800, 'week', 604_800],
    [31_557_600, 'month', 2_629_800],
    [Infinity, 'year', 31_557_600],
  ]
  for (const [limit, unit, divisor] of units) {
    if (seconds < limit) {
      const n = Math.round(seconds / divisor)
      return `${n} ${unit}${n === 1 ? '' : 's'} ago`
    }
  }
  return 'a while ago'
}

/** "in 3 days" / "today" / "2 days ago" — used for deadlines. */
export function countdown(value, reference = new Date()) {
  if (!value) return null
  const target = new Date(value)
  if (Number.isNaN(target.getTime())) return null
  const days = Math.round((target.getTime() - reference.getTime()) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  if (days > 0) return `in ${days} days`
  return `${Math.abs(days)} days ago`
}

export function daysUntil(value, reference = new Date()) {
  if (!value) return null
  const target = new Date(value)
  if (Number.isNaN(target.getTime())) return null
  return Math.round((target.getTime() - reference.getTime()) / 86_400_000)
}

export function truncate(value, length = 140) {
  if (!value) return ''
  const text = String(value)
  if (text.length <= length) return text
  return `${text.slice(0, Math.max(0, length - 1)).trimEnd()}…`
}

export function titleCase(value) {
  if (!value) return ''
  return String(value)
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function pluralise(count, singular, plural) {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`
}

export const STATUS_LABEL = {
  upcoming: 'Upcoming',
  ongoing: 'Ongoing',
  completed: 'Completed',
}

export const FORMAT_LABEL = {
  online: 'Online',
  offline: 'In person',
  hybrid: 'Hybrid',
  unknown: 'Format not stated',
}

export const SOURCE_LABEL = {
  devpost: 'Devpost',
  unstop: 'Unstop',
  devfolio: 'Devfolio',
  hackerearth: 'HackerEarth',
  kaggle: 'Kaggle',
}

export const DIFFICULTY_LABEL = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
}