/**
 * Optional Supabase client.
 *
 * The app is fully functional without Supabase — the backend's built-in auth and
 * the JSON store cover everything. When SUPABASE_URL and the anon key are
 * configured we additionally use Supabase for Auth and Realtime.
 *
 * The anon key is safe in the browser. The service-role key must never appear
 * here or in any VITE_ variable.
 */
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL ?? ''
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

/** Convert a VAPID public key to the Uint8Array the Push API expects. */
export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)))
}