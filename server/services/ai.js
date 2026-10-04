import { config } from '../config.js'
import { createLogger } from '../lib/logger.js'
import { fetchWithRetry } from '../lib/httpClient.js'
import { extractSignals, TIME_ESTIMATES } from './projectIdeas.js'

const log = createLogger('ai')

/**
 * Optional AI enrichment for project ideas.
 *
 * Everything here is server-side: the API key never reaches the browser bundle.
 * When no provider is configured the route falls back to the rule-based
 * generator in projectIdeas.js, and the response says so explicitly via
 * `source: 'rule-based'` so the UI never misrepresents generated content.
 *
 * The provider is any OpenAI-compatible `/chat/completions` endpoint, which
 * covers OpenAI, OpenRouter, Groq, Together, Azure (with the right base URL),
 * and a local Ollama instance.
 */

export function isAiEnabled() {
  if (!config.ai.enabled) return false
  if (config.ai.provider === 'ollama') return Boolean(config.ai.baseUrl)
  return Boolean(config.ai.apiKey)
}

const SYSTEM_PROMPT = `You generate project ideas for competitive hackathons.

You will receive a real hackathon's published details. Produce buildable project
concepts that directly address that specific event's themes and tracks.

Hard requirements for every idea:
- Concrete and specific to the given event. Never generic advice.
- Buildable by 2-4 people in a 24 to 72 hour hackathon.
- Title max 60 characters.
- Every technology in the stack must be named explicitly.
- Implementation steps must be ordered and each must be achievable in the time budget.
- Do not claim the idea will win a prize.

Respond with ONLY a JSON array. Each element:
{
  "title": string,
  "summary": string,          // 1-2 sentences
  "problem": string,          // the problem it solves
  "targetUsers": string,
  "difficulty": "beginner" | "intermediate" | "advanced",
  "technologies": string[],   // 3-6 concrete technologies
  "keyFeatures": string[],    // 4-6 features
  "implementationSteps": string[], // 4-6 ordered steps
  "estimatedTime": string,    // e.g. "36-48 hours"
  "demoTips": string[]        // 2-3 ways to demo during judging
}

No markdown fences, no commentary before or after the JSON.`

function buildUserPrompt(hackathon, count) {
  const signals = extractSignals(hackathon)
  const facts = [
    `Hackathon: ${hackathon.title}`,
    `Organiser: ${hackathon.organizer ?? 'not published'}`,
    `Category: ${hackathon.category ?? 'not classified'}`,
    `Primary focus (inferred from the above): ${signals.theme}`,
    `Published themes: ${signals.themes.join(', ') || 'none published'}`,
    `Technologies mentioned: ${signals.technologies.join(', ') || 'none published'}`,
    `Team size: ${hackathon.teamSize ?? 'not specified'}`,
    `Eligibility: ${hackathon.eligibility ?? 'not specified'}`,
    `Judging criteria: ${hackathon.judgingCriteria ?? 'not published'}`,
    hackathon.description
      ? `Description (first 2500 chars):\n${hackathon.description.slice(0, 2500)}`
      : 'Description: not published',
  ].join('\n')

  return `Generate exactly ${count} distinct project ideas for this event.

${facts}

Every idea must map to a theme or track the organiser actually published.`
}

function parseJsonArray(text) {
  if (!text) return null
  let cleaned = String(text).trim()
  // Strip markdown fences if the model adds them despite instructions.
  cleaned = cleaned.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1))
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

const VALID_DIFFICULTIES = new Set(['beginner', 'intermediate', 'advanced'])

/** Sanitise model output — never trust it to match the schema. */
function normaliseIdea(raw) {
  if (!raw || typeof raw !== 'object') return null
  const title = String(raw.title ?? '').trim()
  if (!title || title.length > 120) return null

  const strArray = (value, max, maxLength = 300) =>
    Array.isArray(value)
      ? value
          .map((v) => String(v).trim())
          .filter(Boolean)
          .slice(0, max)
          .map((v) => (v.length > maxLength ? v.slice(0, maxLength) : v))
      : []

  const difficulty = VALID_DIFFICULTIES.has(String(raw.difficulty).toLowerCase())
    ? String(raw.difficulty).toLowerCase()
    : 'intermediate'

  const features = strArray(raw.keyFeatures, 6)
  const steps = strArray(raw.implementationSteps, 6)
  const technologies = strArray(raw.technologies, 6, 40)
  if (!features.length || !steps.length || !technologies.length) return null

  return {
    title,
    summary: String(raw.summary ?? '').trim().slice(0, 400) || null,
    problem: String(raw.problem ?? raw.summary ?? '').trim().slice(0, 600) || null,
    targetUsers: String(raw.targetUsers ?? '').trim().slice(0, 300) || null,
    difficulty,
    technologies,
    keyFeatures: features,
    implementationSteps: steps,
    estimatedTime: String(raw.estimatedTime ?? TIME_ESTIMATES[difficulty]).slice(0, 60),
    demoTips: strArray(raw.demoTips, 3),
    source: 'ai',
  }
}

export async function generateIdeasWithAi(hackathon, { count = 4 } = {}) {
  if (!isAiEnabled()) {
    return { ok: false, reason: 'not-configured', ideas: [] }
  }

  const headers = { 'content-type': 'application/json' }
  if (config.ai.apiKey && config.ai.provider !== 'ollama') {
    headers.authorization = `Bearer ${config.ai.apiKey}`
  }

  const body = {
    model: config.ai.model,
    temperature: 0.85,
    max_tokens: 2400,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(hackathon, Math.min(count, config.ai.maxIdeas)) },
    ],
  }

  const t0 = Date.now()
  try {
    const res = await fetchWithRetry(
      `${config.ai.baseUrl.replace(/\/$/, '')}/chat/completions`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        timeoutMs: config.ai.timeoutMs,
        retries: 1,
      },
    )
    const payload = await res.json()
    const content = payload?.choices?.[0]?.message?.content
    const parsed = parseJsonArray(content)
    const ideas = (parsed ?? []).map(normaliseIdea).filter(Boolean)

    if (!ideas.length) {
      log.warn('AI returned no usable ideas', { model: config.ai.model })
      return { ok: false, reason: 'empty-response', ideas: [] }
    }

    log.info('AI ideas generated', { count: ideas.length, ms: Date.now() - t0, model: config.ai.model })
    return { ok: true, ideas: ideas.slice(0, count), model: config.ai.model }
  } catch (err) {
    log.warn('AI generation failed; caller should fall back to rules', err.message)
    return { ok: false, reason: 'request-failed', error: err.message, ideas: [] }
  }
}

export function describeAi() {
  return {
    enabled: isAiEnabled(),
    provider: isAiEnabled() ? (config.ai.provider || 'openai') : null,
    model: isAiEnabled() ? config.ai.model : null,
    reason: isAiEnabled()
      ? null
      : config.ai.enabled
        ? 'AI_ENABLED is true but no API key or base URL was configured.'
        : 'No AI provider configured. Rule-based suggestions are being used.',
  }
}
