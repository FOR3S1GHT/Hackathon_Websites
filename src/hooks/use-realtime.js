import * as React from 'react'
import { api } from '@/lib/api'

/**
 * Live updates over Server-Sent Events.
 *
 * The backend exposes `/api/stream`, which works with zero credentials, so the
 * catalogue updates in place after a sync completes without a refresh.
 *
 * Honest framing: SSE pushes happen when a *sync finishes* (default every 30
 * minutes via the scheduler), not instantly when an organiser publishes. The
 * UI labels this "live catalogue" and separately labels discovery dates.
 *
 * Reconnection uses exponential backoff with jitter and pauses while the tab is
 * hidden, because a backgrounded tab reconnecting in a tight loop is a common
 * source of server load for no benefit.
 */
export function useRealtime({ onCatalogueChanged, onNotification } = {}) {
  const [status, setStatus] = React.useState('idle')
  const [lastEvent, setLastEvent] = React.useState(null)
  const [lastEventAt, setLastEventAt] = React.useState(null)

  const catalogueRef = React.useRef(onCatalogueChanged)
  const notificationRef = React.useRef(onNotification)
  catalogueRef.current = onCatalogueChanged
  notificationRef.current = onNotification

  React.useEffect(() => {
    let source = null
    let retryTimer = null
    let attempt = 0
    let closed = false

    const connect = () => {
      if (closed) return
      if (document.visibilityState === 'hidden') {
        // Wait until the tab is visible again rather than holding a dead socket.
        retryTimer = setTimeout(connect, 5_000)
        return
      }

      setStatus(attempt === 0 ? 'connecting' : 'reconnecting')

      try {
        source = new EventSource('/api/stream')
      } catch {
        scheduleRetry()
        return
      }

      source.onopen = () => {
        attempt = 0
        setStatus('connected')
      }

      const handle = (name) => (event) => {
        let payload = null
        try {
          payload = JSON.parse(event.data)
        } catch {
          payload = { raw: event.data }
        }
        setLastEvent({ type: name, payload })
        setLastEventAt(new Date().toISOString())
        if (name === 'notification') notificationRef.current?.(payload)
        else catalogueRef.current?.(payload, name)
      }

      source.addEventListener('inserted', handle('inserted'))
      source.addEventListener('updated', handle('updated'))
      source.addEventListener('expired', handle('expired'))
      source.addEventListener('sync', handle('sync'))
      source.addEventListener('hello', (event) => {
        setStatus('connected')
        try {
          catalogueRef.current?.({ hello: JSON.parse(event.data) }, 'hello')
        } catch {
          /* malformed hello is not worth failing the connection over */
        }
      })

      source.onerror = () => {
        source?.close()
        source = null
        setStatus('offline')
        scheduleRetry()
      }
    }

    const scheduleRetry = () => {
      if (closed) return
      attempt += 1
      // 2s, 4s, 8s, 16s, 30s cap, with ±25% jitter so many tabs do not
      // reconnect in lockstep after a server restart.
      const base = Math.min(30_000, 2_000 * 2 ** (attempt - 1))
      const delay = base * (0.75 + Math.random() * 0.5)
      retryTimer = setTimeout(connect, delay)
    }

    connect()

    const onVisible = () => {
      if (document.visibilityState === 'visible' && !source && !retryTimer) connect()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      closed = true
      document.removeEventListener('visibilitychange', onVisible)
      if (retryTimer) clearTimeout(retryTimer)
      source?.close()
    }
  }, [])

  return { status, lastEvent, lastEventAt }
}

/** Subscribe to server-sent notification events for authenticated users. */
export function useNotificationStream(onNotification) {
  return useRealtime({ onNotification })
}

/**
 * A one-shot wrapper around the stream status endpoint, used by the Data
 * Sources page to show whether SSE is reachable.
 */
export function useStreamHealth() {
  const [info, setInfo] = React.useState(null)
  const [error, setError] = React.useState(null)

  const check = React.useCallback(async () => {
    try {
      setInfo(await api.streamStatus())
      setError(null)
    } catch (err) {
      setError(err)
    }
  }, [])

  React.useEffect(() => {
    check()
  }, [check])

  return { info, error, check }
}