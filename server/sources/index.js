/**
 * Source contract + registry.
 *
 * Every adapter must implement:
 *   name        : string   stable identifier stored on each hackathon row
 *   label       : string   human-readable name shown in the UI
 *   homepage    : string   canonical site the data came from
 *   termsUrl    : string   link to the source's terms / API docs
 *   integration : 'public-api' | 'public-endpoint' | 'structured-data' | 'optional-credentials'
 *   enabled     : () => boolean
 *   fetchAll    : async ({ limit, log }) => RawHackathon[]
 *   fetchDetail : async (record) => Partial<RawHackathon>   (optional)
 */
import { devpost } from './devpost.js'
import { unstop } from './unstop.js'
import { devfolio } from './devfolio.js'
import { hackerearth } from './hackerearth.js'
import { kaggle } from './kaggle.js'

export const SOURCES = [devpost, unstop, devfolio, hackerearth, kaggle]

export function getSource(name) {
  return SOURCES.find((s) => s.name === name) ?? null
}

export function enabledSources() {
  return SOURCES.filter((s) => {
    try {
      return s.enabled()
    } catch {
      return false
    }
  })
}

export function describeSources() {
  return SOURCES.map((source) => ({
    name: source.name,
    label: source.label,
    homepage: source.homepage,
    termsUrl: source.termsUrl,
    docsUrl: source.docsUrl ?? null,
    integration: source.integration,
    enabled: (() => {
      try {
        return source.enabled()
      } catch {
        return false
      }
    })(),
    note: source.note ?? null,
  }))
}

/**
 * Sources that HackRadar deliberately does NOT integrate, with the reason.
 * Surfaced in the UI so the coverage story is honest rather than implied.
 */
export const UNAVAILABLE_SOURCES = [
  {
    name: 'mlh',
    label: 'Major League Hacking (MLH)',
    homepage: 'https://mlh.io/',
    reason:
      'MLH publishes no public API, RSS feed or JSON export. Its event directory is a server-rendered page, so integrating it would require HTML scraping. The same events are frequently listed on Devpost, which HackRadar does integrate, so most MLH events still appear here.',
  },
  {
    name: 'hack2skill',
    label: 'Hack2Skill',
    homepage: 'https://hack2skill.com/',
    reason:
      'Hack2Skill is a client-rendered single-page app with no public API or feed. There is no permitted machine-readable integration path.',
  },
  {
    name: 'kaggle-unauthenticated',
    label: 'Kaggle Competitions (unauthenticated)',
    homepage: 'https://www.kaggle.com/competitions',
    reason:
      'Kaggle requires OAuth credentials for its REST API. HackRadar supports it as an optional source — set KAGGLE_USERNAME and KAGGLE_KEY to enable it. Without credentials it is disabled.',
  },
]
