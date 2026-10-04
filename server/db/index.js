import { config } from '../config.js'
import { createLogger } from '../lib/logger.js'
import { createLocalStore } from './localStore.js'
import { createSupabaseStore } from './supabaseStore.js'

const log = createLogger('db')

/**
 * Resolves the datastore driver once at boot.
 *
 * `auto`  -> Supabase when both URL and service key are present, else local JSON.
 * `supabase` -> fail loudly if credentials are missing.
 * `local` -> always the JSON store.
 */
export async function createStore() {
  const hasSupabase = Boolean(config.supabase.url && config.supabase.serviceRoleKey)

  if (config.store === 'supabase' && !hasSupabase) {
    throw new Error(
      'STORE_DRIVER=supabase but SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are missing. ' +
        'See .env.example.',
    )
  }

  if (config.store === 'supabase' || (config.store === 'auto' && hasSupabase)) {
    try {
      const store = await createSupabaseStore()
      store.driver = 'supabase'
      log.info('Using Supabase store')
      return store
    } catch (err) {
      if (config.store === 'supabase') throw err
      log.error('Supabase store unavailable, falling back to local JSON store', err.message)
    }
  }

  const store = await createLocalStore()
  store.driver = 'local'
  log.info('Using local JSON store (single-process mode)')
  return store
}

export let store = null

export async function initStore() {
  store = await createStore()
  return store
}

/** Must be called after initStore(). Keeps route handlers terse. */
export function getStore() {
  if (!store) throw new Error('Store accessed before initStore()')
  return store
}

export function setStore(next) {
  store = next
  return store
}
