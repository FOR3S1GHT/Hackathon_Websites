import * as React from 'react'
import { api } from '@/lib/api'
import { urlBase64ToUint8Array } from '@/lib/supabase'
import { useAuth } from './use-auth'

/**
 * Notification centre state: list, unread badge, mark-read actions, channel
 * subscriptions and Web Push registration.
 *
 * The unread badge is polled (the app must not claim "instant" updates when it
 * is polling) and additionally pushed over SSE when the browser is on a page
 * with the stream connected — see useRealtime.
 */
export function useNotifications() {
  const { isAuthenticated, user } = useAuth()
  const [items, setItems] = React.useState([])
  const [unread, setUnread] = React.useState(0)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState(null)
  const [preferences, setPreferences] = React.useState(null)

  const load = React.useCallback(async () => {
    if (!isAuthenticated) {
      setItems([])
      setUnread(0)
      return
    }
    setLoading(true)
    try {
      const result = await api.notifications({ limit: 50 })
      setItems(result?.items ?? [])
      setUnread(result?.unreadCount ?? 0)
      setError(null)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  const loadUnread = React.useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const result = await api.unreadCount()
      setUnread(result?.unreadCount ?? 0)
    } catch {
      /* a stale badge is not worth surfacing an error for */
    }
  }, [isAuthenticated])

  const loadPreferences = React.useCallback(async () => {
    if (!isAuthenticated) return
    try {
      setPreferences(await api.notificationPreferences())
    } catch (err) {
      setError(err)
    }
  }, [isAuthenticated])

  React.useEffect(() => {
    load()
  }, [load, user?.id])

  React.useEffect(() => {
    loadPreferences()
  }, [loadPreferences])

  // Poll the badge. 60s is frequent enough to feel live without hammering the
  // API; the UI explicitly labels the badge as polled, not real-time.
  React.useEffect(() => {
    if (!isAuthenticated) return undefined
    const timer = setInterval(loadUnread, 60_000)
    const onFocus = () => loadUnread()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [isAuthenticated, loadUnread])

  const markRead = React.useCallback(async (id) => {
    setItems((prev) =>
      prev.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n)),
    )
    setUnread((prev) => (prev > 0 ? prev - 1 : 0))
    try {
      await api.markRead(id)
    } catch {
      load()
    }
  }, [load])

  const markAllRead = React.useCallback(async () => {
    const now = new Date().toISOString()
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? now })))
    setUnread(0)
    try {
      await api.markAllRead()
    } catch {
      load()
    }
  }, [load])

  const clearAll = React.useCallback(async () => {
    setItems([])
    setUnread(0)
    try {
      await api.clearNotifications()
    } catch {
      load()
    }
  }, [load])

  return {
    items,
    unread,
    loading,
    error,
    preferences,
    reload: load,
    refreshUnread: loadUnread,
    markRead,
    markAllRead,
    clearAll,
    setPreferences,
  }
}

/**
 * Web Push.
 *
 * Nothing here happens without an explicit user gesture: the browser's
 * `Notification.requestPermission()` must be called from a click handler, and the
 * returned promise is only actioned when the answer is `granted`.
 */
export function usePushNotifications() {
  const { isAuthenticated } = useAuth()
  const supported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  const [permission, setPermission] = React.useState(
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'unsupported',
  )
  const [vapidPublicKey, setVapidPublicKey] = React.useState(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState(null)
  const [subscribed, setSubscribed] = React.useState(false)

  React.useEffect(() => {
    if (!isAuthenticated) return
    api
      .pushKey()
      .then((result) => setVapidPublicKey(result?.publicKey ?? null))
      .catch(() => setVapidPublicKey(null))
  }, [isAuthenticated])

  const registerServiceWorker = React.useCallback(async () => {
    if (!('serviceWorker' in navigator)) throw new Error('Service workers are not supported.')
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    return registration
  }, [])

  const enable = React.useCallback(async () => {
    if (!supported) throw new Error('This browser cannot receive web push notifications.')
    setBusy(true)
    setError(null)
    try {
      const result = Notification.requestPermission()
      const decision = await result
      setPermission(decision)
      if (decision !== 'granted') {
        throw new Error('Notification permission was not granted, so nothing was subscribed.')
      }
      if (!vapidPublicKey) {
        throw new Error('Push is not configured on the server, so nothing was subscribed.')
      }
      const registration = await registerServiceWorker()
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        }))
      await api.subscribePush(subscription.toJSON())
      setSubscribed(true)
      return subscription
    } catch (err) {
      setError(err)
      throw err
    } finally {
      setBusy(false)
    }
  }, [supported, vapidPublicKey, registerServiceWorker])

  const disable = React.useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const registration = await navigator.serviceWorker?.getRegistration('/')
      const subscription = await registration?.pushManager?.getSubscription()
      if (subscription) {
        await api.unsubscribePush(subscription.endpoint)
        await subscription.unsubscribe()
      }
      setSubscribed(false)
      return true
    } catch (err) {
      setError(err)
      throw err
    } finally {
      setBusy(false)
    }
  }, [])

  return {
    supported,
    permission,
    subscribed,
    busy,
    error,
    configured: Boolean(vapidPublicKey),
    enable,
    disable,
  }
}