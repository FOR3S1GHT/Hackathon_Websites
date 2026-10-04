/** Small route helpers: async error wrapping, HttpError, and async middleware. */
import { ZodError } from 'zod'
import { createLogger } from './logger.js'

const log = createLogger('http')

export class HttpError extends Error {
  constructor(status, code, message, details = null) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
    this.details = details
  }
}

/** Wraps an async handler so rejected promises reach the Express error handler. */
export function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next)
  }
}

/**
 * Central error handler.
 * Never leaks stack traces or internal messages to the client in production.
 */
export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'validation_error',
      message: 'Some query parameters were invalid.',
      details: err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    })
  }

  if (err instanceof HttpError) {
    if (err.status >= 500) log.error(`${err.code}: ${err.message}`, err)
    return res.status(err.status).json({
      error: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    })
  }

  // Body-parser rejections arrive as plain errors with a `type`, never as
  // HttpError. Left unhandled, a client that sends truncated JSON is told the
  // server broke — which is both untrue and impossible for them to act on.
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: 'invalid_json',
      message: 'The request body was not valid JSON.',
    })
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'payload_too_large',
      message: 'The request body was too large.',
    })
  }
  // Any other client-side rejection express already labelled (bad encoding,
  // unsupported media type, …) keeps its own status rather than becoming a 500.
  const clientStatus = Number(err?.status ?? err?.statusCode)
  if (Number.isInteger(clientStatus) && clientStatus >= 400 && clientStatus < 500) {
    return res.status(clientStatus).json({
      error: 'bad_request',
      message: 'The request could not be processed.',
    })
  }

  log.error(`Unhandled ${req.method} ${req.originalUrl}`, err)

  return res.status(500).json({
    error: 'internal_error',
    message:
      'Something went wrong on our side. The failure has been logged.',
    ...(process.env.NODE_ENV === 'development' ? { debug: err?.message } : {}),
  })
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'not_found',
    message: `No API route matches ${req.method} ${req.path}`,
  })
}
