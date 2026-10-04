import { EventEmitter } from 'node:events'

/**
 * In-process pub/sub used to fan sync results out to SSE subscribers and to
 * decouple the notification pipeline from the request handlers.
 *
 * Deliberately synchronous and in-memory: with a single Node process this is
 * sufficient. If HackRadar is ever scaled to multiple instances, swap this for
 * Redis pub/sub — the emit/consume contract stays identical.
 */
const emitter = new EventEmitter()
emitter.setMaxListeners(0)

export const EVENTS = {
  HACKATHON_INSERTED: 'hackathon:inserted',
  HACKATHON_UPDATED: 'hackathon:updated',
  HACKATHON_EXPIRED: 'hackathon:expired',
  SYNC_COMPLETE: 'sync:complete',
  NOTIFICATION_CREATED: 'notification:created',
}

export function publish(event, payload) {
  emitter.emit(event, payload)
  emitter.emit('*', { event, payload })
}

export function subscribe(event, handler) {
  emitter.on(event, handler)
  return () => emitter.off(event, handler)
}
