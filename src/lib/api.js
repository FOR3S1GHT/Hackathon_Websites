/**
 * Thin fetch wrapper around the HackRadar API.
 *
 * Every call goes through `request`, which guarantees three things:
 *   1. errors surface as a real Error with the server's message, never as an
 *      unhandled rejection or a generic "fetch failed";
 *   2. the Supabase access token is attached automatically when one exists;
 *   3. responses are never silently cached.
 */

const BASE = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'unknown', details = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

/** Token injected by useAuth when Supabase is the active auth provider. */
let tokenProvider = () => null
export function setTokenProvider(fn) {
  tokenProvider = typeof fn === 'function' ? fn : () => null
}

async function request(path, { method = 'GET', body, signal, headers = {} } = {}) {
  const token = tokenProvider()
  const init = {
    method,
    signal,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  }
  if (body) init.body = JSON.stringify(body)

  let response
  try {
    response = await fetch(`${BASE}${path}`, init)
  } catch (err) {
    if (err?.name === 'AbortError') throw err
    throw new ApiError(
      'Could not reach the HackRadar API. Check that the backend is running on port 8787.',
      { code: 'network_error' },
    )
  }

  if (response.status === 204) return null

  const text = await response.text()
  let payload = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    throw new ApiError(payload?.message ?? `Request failed with status ${response.status}`, {
      status: response.status,
      code: payload?.error ?? 'http_error',
      details: payload?.details ?? null,
    })
  }

  return payload
}

const qs = (params) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      if (!value.length) continue
      // Repeated params are the convention the API's zod schema expects.
      for (const item of value) search.append(key, item)
    } else {
      search.append(key, String(value))
    }
  }
  const str = search.toString()
  return str ? `?${str}` : ''
}

export const api = {
  // ------------------------------------------------------------- catalogue --
  listHackathons: (params) => request(`/api/hackathons${qs(params)}`),
  hackathonMeta: () => request('/api/hackathons/meta'),
  featured: () => request('/api/hackathons/featured'),
  recent: (limit = 12) => request(`/api/hackathons/recent${qs({ limit })}`),
  hackathon: (slug) => request(`/api/hackathons/${encodeURIComponent(slug)}`),
  enrichHackathon: (id) => request(`/api/hackathons/${encodeURIComponent(id)}/enrich`, { method: 'POST' }),

  // ------------------------------------------------------------------ meta --
  meta: () => request('/api/meta'),
  health: () => request('/api/health'),
  streamStatus: () => request('/api/stream/status'),

  // ------------------------------------------------------------------ auth --
  authMode: () => request('/api/auth/mode'),
  me: () => request('/api/auth/me'),
  signUp: (body) => request('/api/auth/signup', { method: 'POST', body }),
  signIn: (body) => request('/api/auth/login', { method: 'POST', body }),
  signOut: () => request('/api/auth/logout', { method: 'POST' }),
  passwordReset: (email) => request('/api/auth/password-reset', { method: 'POST', body: { email } }),

  // ------------------------------------------------------------------- me --
  updateMe: (body) => request('/api/me', { method: 'PATCH', body }),
  dashboard: () => request('/api/me/dashboard'),
  bookmarkIds: () => request('/api/me/bookmarks/ids'),
  bookmarks: () => request('/api/me/bookmarks'),
  addBookmark: (id) => request(`/api/me/bookmarks/${encodeURIComponent(id)}`, { method: 'POST' }),
  removeBookmark: (id) => request(`/api/me/bookmarks/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  ideas: () => request('/api/me/ideas'),
  saveIdea: (body) => request('/api/me/ideas', { method: 'POST', body }),
  deleteIdea: (id) => request(`/api/me/ideas/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  subscriptions: () => request('/api/me/subscriptions'),
  setSubscription: (type, body) =>
    request(`/api/me/subscriptions/${encodeURIComponent(type)}`, { method: 'PUT', body }),
  deleteSubscription: (type) =>
    request(`/api/me/subscriptions/${encodeURIComponent(type)}`, { method: 'DELETE' }),

  // --------------------------------------------------------- notifications --
  notifications: ({ limit = 50, unread = false } = {}) =>
    request(`/api/notifications${qs({ limit, unread: unread ? 'true' : undefined })}`),
  unreadCount: () => request('/api/notifications/unread-count'),
  markRead: (id) => request(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' }),
  markAllRead: () => request('/api/notifications/read-all', { method: 'POST' }),
  clearNotifications: () => request('/api/notifications', { method: 'DELETE' }),
  notificationPreferences: () => request('/api/notifications/preferences'),
  pushKey: () => request('/api/notifications/push/key'),
  subscribePush: (body) => request('/api/notifications/push/subscribe', { method: 'POST', body }),
  unsubscribePush: (endpoint) =>
    request('/api/notifications/push/unsubscribe', { method: 'POST', body: { endpoint } }),
  testPush: () => request('/api/notifications/push/test', { method: 'POST' }),

  // ----------------------------------------------------------------- ideas --
  generateIdeas: (body, signal) => request('/api/ideas/generate', { method: 'POST', body, signal }),
  ideaCapabilities: () => request('/api/ideas/capabilities'),
  ideaSuggestions: (idOrSlug) =>
    request(`/api/ideas/${encodeURIComponent(idOrSlug)}/suggestions`),
  formatIdea: (body) => request('/api/ideas/format', { method: 'POST', body }),

  // ------------------------------------------------------------------ cron --
  triggerSync: (params = {}) => request(`/api/cron/sync${qs(params)}`, { method: 'POST' }),
}

export { BASE }