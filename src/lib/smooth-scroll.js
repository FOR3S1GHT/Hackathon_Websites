/**
 * A tiny module-level handle on the single Lenis instance.
 *
 * Kept separate from the React hook so non-React code paths (Radix overlays,
 * route changes) can pause and resume smooth scrolling without needing a
 * context or a hook.
 */

/** @type {import('lenis').default | null} */
let instance = null

export function setLenis(next) {
  instance = next
}

export function getLenis() {
  return instance
}

export function stopLenis() {
  if (!instance) return
  try {
    instance.stop()
    instance.isStopped = true
  } catch {
    /* already destroyed */
  }
}

export function startLenis() {
  if (!instance) return
  try {
    instance.start()
    instance.isStopped = false
  } catch {
    /* already destroyed */
  }
}

/**
 * Reference count so two overlapping overlays (a filter sheet opened from a
 * dialog) cannot resume scrolling when only one of them closes.
 */
const waiters = new Set()

export function acquireScrollLock(token) {
  waiters.add(token)
  stopLenis()
}

export function releaseScrollLock(token) {
  waiters.delete(token)
  if (waiters.size === 0) startLenis()
}