/**
 * Shared vitest setup.
 *
 * Two jobs:
 *  1. make every test hermetic — the real datastore, the real scheduler and the
 *     real .env must never influence a unit test;
 *  2. load jest-dom only when a DOM actually exists, since setup files run in
 *     the node environment too.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// --- hermetic environment -------------------------------------------------
// Set before any server module is imported, because server/config.js reads
// process.env at module scope.
process.env.NODE_ENV = 'test'
process.env.STORE_DRIVER = 'local'

// The local store writes a single JSON file. Point DATA_DIR at a fresh temp
// directory so a test run can never read or overwrite the developer's real
// 800-record catalogue in ./data.
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'hackradar-test-'))

// Local-session auth needs a signing key. A fixed test-only value keeps tokens
// reproducible; it is never used outside NODE_ENV=test.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret-do-not-use-in-production'

// Nothing may reach the network or the scheduler from a test.
process.env.SYNC_SCHEDULE_ENABLED = 'false'
process.env.SYNC_ON_START = 'false'
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent'

// Rate limits are raised for the run so that one suite cannot exhaust the
// budget and make unrelated assertions fail with a 429. The limiter itself is
// asserted separately via its response headers.
process.env.RATE_LIMIT_WINDOW_MS = process.env.RATE_LIMIT_WINDOW_MS || '60000'
process.env.RATE_LIMIT_GENERAL = process.env.RATE_LIMIT_GENERAL || '100000'
process.env.RATE_LIMIT_AUTH = process.env.RATE_LIMIT_AUTH || '100000'
process.env.RATE_LIMIT_WRITE = process.env.RATE_LIMIT_WRITE || '100000'
process.env.RATE_LIMIT_AI = process.env.RATE_LIMIT_AI || '100000'

// --- DOM-only matchers ----------------------------------------------------
if (typeof window !== 'undefined') {
  await import('@testing-library/jest-dom/vitest')

  // jsdom implements neither of these, and both are used by the UI primitives.
  if (!window.matchMedia) {
    window.matchMedia = (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false
      },
    })
  }

  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }

  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {}
  }
}