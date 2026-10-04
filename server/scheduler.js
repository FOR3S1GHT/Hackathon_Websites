import cron from 'node-cron'
import { config } from './config.js'
import { createLogger } from './lib/logger.js'
import { runSync } from './pipeline/sync.js'
import { dispatchDeadlineReminders, buildDailyDigest } from './services/notifications.js'

const log = createLogger('scheduler')

let tasks = []

/**
 * In-process scheduled jobs.
 *
 * These run only when the Node process stays alive. On platforms that freeze or
 * scale the process to zero, configure an external scheduler against
 * /api/cron/sync instead (see server/routes/cron.js and README).
 */
export function startScheduler() {
  stopScheduler()

  if (!cron.validate(config.sync.cron)) {
    log.error(`Invalid SYNC_CRON expression "${config.sync.cron}" — scheduler not started`)
    return
  }

  // Main synchronization pass.
  tasks.push(
    cron.schedule(
      config.sync.cron,
      async () => {
        try {
          await runSync({})
        } catch (err) {
          log.error('Scheduled sync failed', err)
        }
      },
      { name: 'sync' },
    ),
  )

  // Deadline reminders: hourly, so the "closing soon" window stays accurate.
  tasks.push(
    cron.schedule(
      '17 * * * *',
      async () => {
        try {
          const created = await dispatchDeadlineReminders()
          if (created) log.info(`Deadline reminders created: ${created}`)
        } catch (err) {
          log.error('Deadline reminder job failed', err)
        }
      },
      { name: 'deadlines' },
    ),
  )

  // Daily digest: 08:00 UTC.
  tasks.push(
    cron.schedule(
      '0 8 * * *',
      async () => {
        try {
          const digest = await buildDailyDigest()
          if (digest.events.length) {
            log.info(`Daily digest ready for ${digest.recipients} recipient(s)`, {
              events: digest.events.length,
            })
          }
        } catch (err) {
          log.error('Daily digest job failed', err)
        }
      },
      { name: 'digest' },
    ),
  )

  // Housekeeping: expire finished events hourly so status columns stay fresh.
  tasks.push(
    cron.schedule(
      '43 * * * *',
      async () => {
        try {
          const { getStore } = await import('./db/index.js')
          const count = await getStore().markExpired()
          if (count) log.info(`Marked ${count} event(s) as completed`)
        } catch (err) {
          log.error('Expiry job failed', err)
        }
      },
      { name: 'expire' },
    ),
  )

  log.info(`Scheduler started`, { cron: config.sync.cron, jobs: tasks.length })

  if (config.sync.runOnBoot) {
    // Delay slightly so the HTTP server starts accepting requests first.
    setTimeout(() => {
      runSync({}).catch((err) => log.error('Boot sync failed', err))
    }, 2000).unref?.()
  }
}

export function stopScheduler() {
  for (const task of tasks) {
    try {
      task.stop()
    } catch {
      /* already stopped */
    }
  }
  tasks = []
}
