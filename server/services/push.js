import webpush from 'web-push'
import { config } from '../config.js'
import { getStore } from '../db/index.js'
import { createLogger } from '../lib/logger.js'

const log = createLogger('push')

let initialised = false

export function isPushEnabled() {
  return Boolean(config.push.publicKey && config.push.privateKey)
}

/**
 * Initialise web-push with VAPID keys. Generate a key pair with:
 *   npx web-push generate-vapid-keys
 * and put the output in .env as VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.
 */
export function initPush() {
  if (!isPushEnabled()) {
    log.info('Web Push disabled (VAPID keys not configured)')
    return false
  }
  if (initialised) return true
  try {
    webpush.setVapidDetails(config.push.subject, config.push.publicKey, config.push.privateKey)
    initialised = true
    log.info('Web Push initialised')
    return true
  } catch (err) {
    log.error('Web Push initialisation failed', err)
    return false
  }
}

export async function sendPushToUser(userId, notifications) {
  if (!initPush()) return { sent: 0, skipped: 'not-configured' }

  const store = getStore()
  const subs = await store.listPushSubscriptions(userId)
  if (!subs.length) return { sent: 0, skipped: 'no-subscriptions' }

  const payload = JSON.stringify({
    title: notifications[0]?.title ?? 'New hackathons on HackRadar',
    body:
      notifications.length === 1
        ? notifications[0].message
        : `${notifications.length} new hackathons matching your interests.`,
    url: notifications[0]?.metadata?.slug ? `/hackathon/${notifications[0].metadata.slug}` : '/notifications',
    tag: `hackradar-${userId}`,
  })

  let sent = 0
  let removed = 0

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 60 * 60 * 12, urgency: 'normal' },
        )
        sent += 1
      } catch (err) {
        // 404/410 mean the browser discarded the subscription — clean it up.
        if (err.statusCode === 404 || err.statusCode === 410) {
          await store.removePushSubscription(userId, sub.endpoint)
          removed += 1
        } else {
          log.warn('Push send failed', err.statusCode ?? err.message)
        }
      }
    }),
  )

  if (removed) log.info(`Removed ${removed} stale push subscriptions`)
  return { sent, removed }
}
