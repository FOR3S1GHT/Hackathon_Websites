/**
 * HackRadar service worker.
 *
 * Scope is intentionally narrow: it exists only to receive Web Push
 * notifications. There is no offline cache, no background sync and no
 * fetch interception, because a stale catalogue is worse than an honest
 * error message.
 *
 * The worker never runs unless the user explicitly granted push permission.
 */

self.addEventListener('install', () => {
  // Nothing to install; take over immediately so the first push is not missed.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

/** Build a sensible notification from whatever shape the server sent. */
function toNotificationOptions(payload) {
  const data = payload && typeof payload === 'object' ? payload : {}
  return {
    body: data.body || 'A hackathon you care about changed.',
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    requireInteraction: Boolean(data.requireInteraction),
    data: {
      url: data.url || '/notifications',
      notificationId: data.notificationId || null,
    },
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    timestamp: data.timestamp || Date.now(),
  }
}

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { body: event.data ? event.data.text() : undefined }
  }

  const title = payload.title || 'HackRadar'
  event.waitUntil(self.registration.showNotification(title, toNotificationOptions(payload)))
})

/**
 * Clicking a notification focuses an existing tab on the target URL when one is
 * open, and only opens a new tab as a fallback. `clients.matchAll` is scoped to
 * same-origin tabs only, so nothing outside HackRadar is ever touched.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/notifications', self.location.origin).href

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      for (const client of clientList) {
        if (new URL(client.url).origin !== self.location.origin) continue
        await client.focus()
        if ('navigate' in client) await client.navigate(target)
        return
      }
      await self.clients.openWindow(target)
    })(),
  )
})