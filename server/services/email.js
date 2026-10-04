import { createHmac } from 'node:crypto'
import nodemailer from 'nodemailer'
import { config } from '../config.js'
import { createLogger } from '../lib/logger.js'

const log = createLogger('email')

/**
 * Email delivery via SMTP or Resend.
 *
 * With no provider configured this is a no-op that returns a clear, explicit
 * result — the API surfaces `emailEnabled: false` so the UI can explain that
 * email subscriptions are stored but not yet delivered, rather than silently
 * pretending to send.
 */

let transporter = null

export function isEmailEnabled() {
  return Boolean(
    config.email.provider &&
      (config.email.resendApiKey || config.email.smtp.host),
  )
}

function getTransporter() {
  if (transporter) return transporter
  if (!isEmailEnabled()) return null

  if (config.email.provider === 'resend') {
    // Resend speaks SMTP on port 465 with API-key auth.
    transporter = nodemailer.createTransport({
      host: 'smtp.resend.com',
      port: 465,
      secure: true,
      auth: { user: 'resend', pass: config.email.resendApiKey },
    })
  } else {
    transporter = nodemailer.createTransport({
      host: config.email.smtp.host,
      port: config.email.smtp.port,
      secure: config.email.smtp.secure,
      auth: config.email.smtp.user
        ? { user: config.email.smtp.user, pass: config.email.smtp.pass }
        : undefined,
    })
  }
  return transporter
}

export async function sendEmail({ to, subject, text, html }) {
  if (!to) return { sent: false, reason: 'no-recipient' }
  const tx = getTransporter()
  if (!tx) {
    log.info(`Email not sent (no provider configured): "${subject}" -> ${to}`)
    return { sent: false, reason: 'not-configured' }
  }

  try {
    const info = await tx.sendMail({ from: config.email.from, to, subject, text, html })
    log.info(`Email sent: "${subject}" -> ${to}`)
    return { sent: true, messageId: info.messageId }
  } catch (err) {
    log.error('Email send failed', err.message)
    return { sent: false, reason: 'send-failed', error: err.message }
  }
}

/** One-click unsubscribe link with an HMAC-signed token. */
export function buildUnsubscribeUrl(userId, subscriptionType, baseUrl, secret) {
  const payload = `${userId}.${subscriptionType}`
  const sig = signPayload(payload, secret)
  return `${baseUrl.replace(/\/$/, '')}/api/unsubscribe?u=${encodeURIComponent(userId)}&t=${encodeURIComponent(subscriptionType)}&sig=${sig}`
}

export function signPayload(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('hex').slice(0, 32)
}

export function verifyUnsubscribeSig(userId, subscriptionType, sig, secret) {
  return signPayload(`${userId}.${subscriptionType}`, secret) === sig
}

export function renderDigestHtml(events) {
  const rows = events
    .map(
      (event) => `<li style="margin-bottom:16px">
  <strong style="font-size:16px">${escapeHtml(event.title)}</strong><br/>
  <span style="color:#666">${escapeHtml(event.organizer ?? 'Organiser not published')} · via ${escapeHtml(event.sourceName)}</span><br/>
  ${event.registrationDeadline ? `<span>Registration deadline: ${escapeHtml(String(event.registrationDeadline).slice(0, 10))}</span><br/>` : ''}
  ${event.slug ? `<a href="/hackathon/${encodeURIComponent(event.slug)}">View details →</a>` : ''}
</li>`,
    )
    .join('')

  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#000;background:#fff">
  <div style="max-width:640px;margin:0 auto;padding:24px;border:3px solid #000">
    <h1 style="font-size:28px;text-transform:uppercase;letter-spacing:-1px;margin:0 0 4px">HACKRADAR</h1>
    <p style="margin:0 0 24px;color:#555">${events.length} new hackathon${events.length === 1 ? '' : 's'} discovered in the last 24 hours.</p>
    <ul style="list-style:none;padding:0;margin:0">${rows}</ul>
    <hr style="border:none;border-top:2px solid #000;margin:24px 0"/>
    <p style="font-size:12px;color:#666">You receive this because you subscribed to the HackRadar daily digest.</p>
  </div>
</body></html>`
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

