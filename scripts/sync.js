/**
 * Manual / scheduled synchronization CLI.
 *
 *   npm run sync                      # respect per-source intervals
 *   npm run sync -- --force           # ignore intervals
 *   npm run sync -- --source devpost  # one source only
 *   npm run sync -- --no-enrich      # skip detail enrichment
 *
 * Point an external scheduler at this command, or at the HTTP endpoint:
 *   curl -fsS "$APP_URL/api/cron/sync" -H "Authorization: Bearer $CRON_SECRET"
 */
import { initStore } from '../server/db/index.js'
import { runSync } from '../server/pipeline/sync.js'
import { createLogger } from '../server/lib/logger.js'

const log = createLogger('cli')

function parseArgs(argv) {
  const args = { force: false, sources: [], enrich: undefined }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--force' || arg === '-f') args.force = true
    else if (arg === '--source' || arg === '-s') {
      const next = argv[i + 1]
      if (next) {
        args.sources.push(...next.split(',').map((s) => s.trim()).filter(Boolean))
        i += 1
      }
    } else if (arg === '--no-enrich') args.enrich = 0
    else if (arg === '--enrich') {
      const next = Number(argv[i + 1])
      if (Number.isFinite(next)) {
        args.enrich = next
        i += 1
      }
    }
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  await initStore()

  log.info('Starting synchronization', {
    force: args.force,
    sources: args.sources.length ? args.sources : 'all enabled',
    enrich: args.enrich,
  })

  const summary = await runSync({
    sources: args.sources.length ? args.sources : undefined,
    force: args.force,
    enrichBudget: args.enrich,
  })

  console.log(
    JSON.stringify(
      {
        discovered: summary.discovered,
        inserted: summary.inserted,
        updated: summary.updated,
        expired: summary.expired,
        enriched: summary.enriched,
        notificationsQueued: summary.notificationsQueued,
        errors: summary.errors,
        error: summary.error ?? null,
        durationMs: summary.durationMs,
        perSource: summary.sources,
      },
      null,
      2,
    ),
  )

  // The local store debounces writes; force a synchronous flush so nothing is
  // lost when the CLI exits immediately afterwards.
  const { getStore } = await import('../server/db/index.js')
  const store = getStore()
  if (typeof store.flushSync === 'function') store.flushSync()

  process.exit(summary.error ? 1 : 0)
}

main().catch((err) => {
  log.error('Synchronization failed', err)
  process.exit(1)
})
