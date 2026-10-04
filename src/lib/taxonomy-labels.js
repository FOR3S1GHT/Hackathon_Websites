/**
 * Labels shared by the UI.
 *
 * Values come from `shared/taxonomy.js` — the same module the backend
 * classifier imports — so a category can never be renamed in one place and
 * forgotten in the other.
 */
import { CATEGORIES, TECHNOLOGIES } from '@shared/taxonomy.js'
import {
  DIFFICULTY_LABEL,
  FORMAT_LABEL,
  SOURCE_LABEL,
  STATUS_LABEL,
  formatDate,
  formatDateRange,
  formatMoney,
  formatPrize,
  countdown,
  daysUntil,
  relativeTime,
  titleCase,
  truncate,
} from '@/lib/format'

export const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label]))
export const CATEGORY_BLURB = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.blurb]))
export const CATEGORY_LIST = CATEGORIES
export const TECHNOLOGY_LIST = TECHNOLOGIES
export const TECHNOLOGY_LABEL = Object.fromEntries(TECHNOLOGIES.map((t) => [t.key, t.label]))

export {
  DIFFICULTY_LABEL,
  FORMAT_LABEL,
  SOURCE_LABEL,
  STATUS_LABEL,
  countdown,
  daysUntil,
  formatDate,
  formatDateRange,
  formatMoney,
  formatPrize,
  relativeTime,
  titleCase,
  truncate,
}