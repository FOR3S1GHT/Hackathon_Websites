const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 }
const threshold = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info

const COLORS = {
  debug: '\x1b[90m',
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
  reset: '\x1b[0m',
  dim: '\x1b[2m',
}

function emit(level, scope, message, meta) {
  if (LEVELS[level] < threshold) return
  const ts = new Date().toISOString()
  const tag = `${COLORS[level]}${level.toUpperCase().padEnd(5)}${COLORS.reset}`
  const scopeTag = `${COLORS.dim}${scope}${COLORS.reset}`
  let line = `${COLORS.dim}${ts}${COLORS.reset} ${tag} ${scopeTag} ${message}`
  if (meta !== undefined) {
    if (meta instanceof Error) {
      line += `\n${COLORS.dim}  ${meta.stack || meta.message}${COLORS.reset}`
    } else {
      let serialised
      try {
        serialised = JSON.stringify(meta)
      } catch {
        serialised = String(meta)
      }
      if (serialised && serialised !== '{}') line += ` ${COLORS.dim}${serialised}${COLORS.reset}`
    }
  }
  console.log(line)
}

export function createLogger(scope) {
  return {
    debug: (msg, meta) => emit('debug', scope, msg, meta),
    info: (msg, meta) => emit('info', scope, msg, meta),
    warn: (msg, meta) => emit('warn', scope, msg, meta),
    error: (msg, meta) => emit('error', scope, msg, meta),
    child: (sub) => createLogger(`${scope}:${sub}`),
  }
}

export const logger = createLogger('hackradar')
