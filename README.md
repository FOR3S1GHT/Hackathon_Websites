# HackRadar

**Live hackathon discovery, from sources that actually publish their data.**

HackRadar syncs real hackathons from Devpost, Unstop, Devfolio and HackerEarth
into one normalised catalogue, then lets you search it, filter it, bookmark it,
and get per-event project idea suggestions.

Nothing in the catalogue is invented. Where a source does not publish something,
the field is empty and the interface says so — rather than filling the gap with a
plausible guess.

```bash
npm install
cp .env.example .env
npm run sync     # ~2.5 min on a cold start, fetches 800+ real events
npm run dev      # API on :8787, Vite on :5173
```

Open <http://localhost:5173>.

**No credentials are required.** With an empty `.env`, HackRadar uses a local
JSON store, built-in email/password auth, a deterministic rule-based idea
generator, and real data from the four public sources. Every optional
integration (Supabase, AI, email, Web Push) upgrades a specific feature and is
labelled as unavailable in the UI when not configured.

---

## Contents

- [What it does](#what-it-does)
- [Stack](#stack)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [How the data pipeline works](#how-the-data-pipeline-works)
- [Search, filters and URLs](#search-filters-and-urls)
- [Project ideas](#project-ideas)
- [Auth and user data](#auth-and-user-data)
- [Notifications](#notifications)
- [API reference](#api-reference)
- [Supabase setup](#supabase-setup)
- [Deployment](#deployment)
- [Testing](#testing)
- [Project structure](#project-structure)
- [Honesty guarantees](#honesty-guarantees)
- [Further reading](#further-reading)

---

## What it does

**Catalogue.** 800+ real hackathons from four publishers, deduplicated across
sources, classified into 14 categories and 76 technologies, with status derived
from the organiser's own dates.

**Search and filter.** Debounced full-text search across title, organiser,
summary, themes, technologies, location and country. Thirteen filter dimensions
plus eight sort orders. Every filter state lives in the URL, so any view is
shareable and survives a reload.

**Detail pages.** Full description, eligibility (taken verbatim from the source),
judging criteria, team size, prize, registration deadline, links out to the
organiser, and a clear three-way split between *when the organiser published
this*, *when HackRadar discovered it*, and *when the record last changed*.

**Project ideas.** Per-event suggestions with name, problem, target users,
suggested stack, features, implementation steps, difficulty, time estimate and
demo tips. AI-drafted when `AI_PROVIDER` is configured; deterministic
rule-based otherwise, derived from the event's real published themes.

**Bookmarks and saved ideas.** Works with an account, and browsing works without
one.

**Notifications.** In-app centre with unread counts and a Web Push channel, plus
an email digest. Opt-in only, with quiet hours and deduplication.

---

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 18 (JavaScript, `.jsx` — no TypeScript), Vite 6, React Router 6 |
| Styling | Tailwind CSS 3.4, shadcn/ui primitives restyled to Neo-Brutalism |
| Animation | Motion (Framer Motion) 11, Lenis for smooth scroll |
| Icons | Lucide React |
| Backend | Node 20+, Express 4, Zod validation |
| Auth | Supabase Auth, or a built-in scrypt + JWT fallback |
| Database | Supabase Postgres, or a local JSON file store |
| Scheduling | node-cron in-process, or an external cron calling `/api/cron/sync` |
| Tests | Vitest 2, Testing Library, Supertest |

The local JSON store and the Supabase store sit behind one interface
(`server/db/index.js`), so both are first-class rather than one being a stub.
Search, filtering, sorting and pagination are **pure functions** in
`server/services/search.js` shared by both drivers and unit-tested directly
without a database.

---

## Quick start

**Requirements:** Node.js 20 or newer.

```bash
npm install
cp .env.example .env      # works as-is, empty values
npm run sync              # populate data/hackradar-db.json
npm run dev
```

`npm run dev` starts both processes:

| Process | Port | What |
|---|---|---|
| `dev:server` | 8787 | Express API, scheduler, sync |
| `dev:web` | 5173 | Vite dev server, proxying `/api` → 8787 |

The app is at <http://localhost:5173>.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API + web together |
| `npm run dev:server` | API only, with `--watch` reload |
| `npm run dev:web` | Vite only |
| `npm run sync` | One-shot fetch of every enabled source into the store |
| `npm test` | Full test suite |
| `npm run test:watch` | Tests in watch mode |
| `npm run lint` | ESLint, zero warnings tolerated |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm start` | Production API server (also serves `dist/` if built) |
| `npm run icons` | Regenerate PWA icons from `scripts/icons/` source |

On Windows PowerShell, use `npm.cmd` instead of `npm` — PowerShell's script
execution policy blocks `npm.ps1`.

### Deleting local data

The store is `data/hackradar-db.json`. It is derived data, git-ignored, and safe
to delete at any time to force a clean re-sync.

---

## Configuration

Everything is optional. Copy `.env.example` and fill in only what you need —
it is fully commented, and contains no secrets.

The four capability groups:

| Group | Blank means | Set it to get |
|---|---|---|
| `SUPABASE_*` | Local JSON store, built-in auth | Postgres + Supabase Auth |
| `AI_*` | Deterministic rule-based ideas | AI-drafted ideas |
| `EMAIL_*` | Subscriptions saved, nothing sent | Real email digests |
| `VAPID_*` | Push toggle disabled | Web Push notifications |

### Frequently used variables

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `8787` | API port |
| `STORE_DRIVER` | `auto` | `auto` \| `supabase` \| `local` |
| `SYNC_CRON` | `*/30 * * * *` | In-process scheduler |
| `SYNC_RUN_ON_BOOT` | `true` | Fetch once at startup |
| `CRON_SECRET` | — | **Set in production**, see below |
| `SYNC_ENRICHMENT_BUDGET` | `40` | Detail pages fetched per run |
| `JWT_SECRET` | — | **Required in production** for built-in auth |
| `RATE_LIMIT_*` | see file | Per-tier request ceilings |

### Production checklist

Two values matter more than the rest:

- **`CRON_SECRET`** — without it, `POST /api/cron/sync` is callable by anyone who
  finds the URL, which lets a stranger trigger full source syncs. Generate one
  and send it as an `x-cron-secret` header.
- **`JWT_SECRET`** — without it the built-in auth cannot sign sessions and will
  refuse to start in production.

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## How the data pipeline works

```
sources ──▶ normalise ──▶ classify ──▶ dedupe ──▶ upsert ──▶ SSE push
```

1. **Fetch** — each due source concurrently, bounded concurrency. A failing
   source is logged and retried with backoff; it never fails the whole run.
2. **Normalise** — every record becomes one shape, regardless of source.
3. **Classify** — category, technologies, format, country by word-boundary
   keyword matching against `shared/taxonomy.js`.
4. **Dedupe** — cross-source duplicates merged by slug, then by title-token
   Jaccard similarity.
5. **Upsert** — keyed on `(sourceName, sourceEventId)`, so re-syncing never
   duplicates.
6. **Re-status** — events past their end date become `completed`, derived from
   published dates only.
7. **Log** — a `sync_logs` row per run with counts, errors and duration.

Full detail, including the three bugs found in the Unstop connector and why they
mattered, is in **[DATA_SOURCES.md](DATA_SOURCES.md)**.

### Sources

| Source | Integration | Credentialed | Interval |
|---|---|---|---|
| Devpost | Public JSON API | No | 45 min |
| Unstop | Public JSON API (`robots.txt`: `Allow: /api/public/*`) | No | 90 min |
| Devfolio | Public JSON API | No | 240 min |
| HackerEarth | Public endpoint (official Chrome extension) | No | 180 min |
| Kaggle | REST API | **Yes** — off by default | 720 min |

Not integrated, with reasons: **MLH** (no API or feed; would require scraping)
and **Hack2Skill** (client-rendered SPA, no machine-readable path). Both appear
in the app's Data Sources page rather than being silently absent.

---

## Search, filters and URLs

Search is **word-start-anchored prefix matching**, not raw substring. This is a
real behavioural difference, not an implementation detail: substring matching
made `ai` match "blockchain", `ar` match "start", and `ml` match "html". All
three were live bugs caught by tests.

- Matches at the start of any word: `block` finds "Blockchain", `chain` does not.
- Every query term must match (AND).
- Ranking prefers title matches, then organiser, then the rest.

### Filters

| Dimension | Query parameter | Values |
|---|---|---|
| Free text | `q` | word-start-anchored prefix match |
| Status | `status` | upcoming, ongoing, completed, newly-added |
| Registration | `registration` | open, closing-soon |
| Format | `format` | online, offline, hybrid |
| Category | `category` | 14 taxonomy keys |
| Technology | `technology` | 76 technology labels |
| Country | `country` | derived from location |
| Difficulty | `difficulty` | beginner, intermediate, advanced |
| Date range | `dateFrom`, `dateTo` | ISO dates |
| Boolean | `free`, `prize`, `beginnerFriendly`, `featured` | `true` or `false` |

Repeated or comma-separated values within one dimension are ORed; different
dimensions are ANDed. Omitting a boolean means no restriction; passing `false`
selects the inverse, so `?prize=false` is "events with no published prize pool".

`?free=true` is deliberately narrow: it matches only events whose source
**stated** that entry costs nothing (`is_free = true`). Only Unstop publishes an
entry-fee flag, so this is a small slice of the catalogue — but treating "no fee
published" as "free" would return 777 of 839 events, 576 of which render
"Fee: not stated" on their own page. Unknown is not evidence of a charge, and it
is not evidence of a free one either.

`?sort` accepts `recently-discovered`, `registration-deadline`, `start-date`,
`prize-pool`, `alphabetical`, `relevance`. Anything else is a `400`, not a
silent fallback.

### URL state

Every filter lives in the query string. Copy the address bar and someone else
sees exactly what you saw, including the page. **Clear filters** is always
available, and empty states name the active filters rather than showing a bare
"No results".

```
/explore?q=ai&category=artificial-intelligence&status=upcoming&sort=registration-deadline
```

---

## Project ideas

Each suggestion carries: **name, summary, the problem it addresses, target
users, suggested stack, features, implementation steps, difficulty, time
estimate, and demo tips.**

### Two engines, always labelled

- **AI** — any OpenAI-compatible `/chat/completions` endpoint (OpenAI,
  OpenRouter, Groq, Together, Azure, or a local Ollama). The API key is read
  only by the server. Prompts are grounded in the event's real published themes,
  technologies, eligibility and description.
- **Rule-based** — deterministic, derived from the same real event data. Used
  when AI is not configured, and when an AI call fails.

The UI always states which engine produced the batch. It never implies AI ran
when it did not.

### On distinctness

The generator returns **fewer ideas than requested when the event genuinely has
fewer distinct concepts**, and says so explicitly:

> Showing 2 of the 3 requested: this event publishes 2 distinct concepts from
> its own themes. Generate again to reshuffle the wording and difficulty, not to
> pad the list with near-duplicates.

Padding a short list with restated variants was the behaviour this replaced. The
API returns `requestedCount` and `availableCount` so the UI can be honest about
it.

### Actions

Generate, regenerate, filter by difficulty, compare side by side, save to your
account, copy to clipboard, download as Markdown.

Every batch carries an unconditional disclaimer:

> Suggestions are derived from this event's published themes. They are not
> official organiser requirements and do not guarantee selection or a prize.

---

## Auth and user data

Two modes, chosen automatically:

- **Supabase Auth** when `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set.
- **Built-in** otherwise: scrypt password hashing, HS256 JWTs in an httpOnly,
  SameSite cookie, via `jose`.

Both support email sign-up, login, logout, password recovery and a profile with
preferred categories, technologies and notification preferences.

**Browsing never requires an account.** Bookmarks, saved ideas and notifications
prompt you to sign in at the point of use rather than gating the catalogue
behind a wall.

A Bearer token is checked before the cookie, so the API works from mobile
clients and tests as well as from a browser.

---

## Notifications

Three channels, all opt-in:

- **In-app** — unread counts in the header, mark-one-read, mark-all-read,
  filtered by kind.
- **Web Push** — behind an explicit permission prompt. VAPID keys required; the
  toggle is disabled with an explanation when they are absent.
- **Email** — subscriptions and digests, with working unsubscribe.

Every queued notification is **deduplicated** against recent deliveries,
**suppressed during quiet hours** (default 22:00–08:00 UTC, per-user
overridable), and **capped** per user per sync run. Nothing is ever sent without
an explicit opt-in.

Live updates arrive over **Server-Sent Events** at `/api/stream`, which works
with no credentials and no Supabase.

---

## API reference

All routes are JSON. Errors return `{ error: { code, message, details? } }`.

### Public

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Liveness probe — never rate-limited |
| `GET` | `/api/meta` | Capabilities, stats, sources, sync status, recent runs |
| `GET` | `/api/hackathons` | Search, filter, sort, paginate |
| `GET` | `/api/hackathons/featured` | Featured events |
| `GET` | `/api/hackathons/recent` | Recently discovered |
| `GET` | `/api/hackathons/meta` | Filter vocabulary with live counts |
| `GET` | `/api/hackathons/:slug` | Full detail (lazy enrichment) |
| `POST` | `/api/hackathons/:id/enrich` | Force on-demand enrichment of one event |
| `GET` | `/api/ideas/capabilities` | Whether AI is configured |
| `GET` | `/api/ideas/:idOrSlug/suggestions` | Default suggestions for an event |
| `POST` | `/api/ideas/generate` | Generate suggestions for an event |
| `POST` | `/api/ideas/format` | Render an idea as copyable text |
| `GET` | `/api/stream` | SSE: `hello`, `inserted`, `updated`, `expired`, `sync` |
| `GET` | `/api/stream/status` | Connected subscriber count |
| `GET` | `/api/auth/mode` | Which auth backend is active |

### Authenticated

All of these require a session (`Authorization: Bearer …` or the httpOnly cookie) and return `401` without one.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/signup`, `/api/auth/login`, `/api/auth/logout` | Session lifecycle |
| `GET` | `/api/auth/me` | Current session profile |
| `POST` | `/api/auth/password-reset` | Password reset |
| `PATCH` | `/api/me` | Profile and preferences |
| `GET` | `/api/me/dashboard` | Everything the dashboard needs in one call |
| `GET`/`POST`/`DELETE` | `/api/me/bookmarks`, `/api/me/bookmarks/:hackathonId` | Bookmarks |
| `GET` | `/api/me/bookmarks/ids` | Bookmark ids only (nav badge) |
| `GET`/`POST`/`DELETE` | `/api/me/ideas`, `/api/me/ideas/:id` | Saved project ideas |
| `GET`/`PUT`/`DELETE` | `/api/me/subscriptions`, `/api/me/subscriptions/:type` | Email/push subscriptions |
| `GET` | `/api/notifications`, `/api/notifications/unread-count` | Notification centre |
| `POST` | `/api/notifications/:id/read`, `/api/notifications/read-all` | Mark read |
| `GET`/`PUT` | `/api/notifications/preferences` | Channel + quiet-hour settings |
| `POST` | `/api/notifications/push/subscribe`, `/unsubscribe`, `/test` | Web Push |
| `GET` | `/api/notifications/push/key` | VAPID public key |
| `GET` | `/api/notifications/stream` | Per-user SSE |

### Operational

| Method | Path | Purpose |
|---|---|---|
| `GET`/`POST` | `/api/cron/sync` | Trigger a sync (requires `CRON_SECRET`) |
| `POST` | `/api/cron/deadlines` | Deadline reminders for one user |
| `POST` | `/api/cron/digest` | Email digest for one user |
| `GET` | `/api/cron/verify` | Connectivity check for every configured source |

### Response shapes

```jsonc
// GET /api/hackathons
{
  "items": [...],
  "pagination": { "page": 1, "pageSize": 24, "total": 811, "totalPages": 34 },
  "facets":   { "category": [...], "technology": [...], ... },
  "counts":   { ... },
  "appliedFilters": { ... }
}

// GET /api/hackathons/:slug
{
  "hackathon": { ... },
  "derivedStatus": "upcoming",
  "daysToRegistrationDeadline": 12,
  "duplicates": [...]
}
```

---

## Supabase setup

Optional. Without it HackRadar runs on the local JSON store.

1. Create a project at <https://supabase.com>.
2. **SQL Editor** → run `supabase/migrations/0001_schema.sql`, then
   `supabase/migrations/0002_rls.sql`, in order.
3. **Project Settings → API** → copy the URL, the `anon` key, and the
   `service_role` key.
4. Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
5. `STORE_DRIVER=supabase` to require it (startup fails loudly if credentials are
   missing — useful in CI).

### Schema

`hackathons`, `profiles`, `bookmarks`, `project_ideas`, `notifications`,
`notification_subscriptions`, `sync_logs`, plus `push_subscriptions`.

### Row Level Security

`0002_rls.sql` enables RLS on every user table and adds policies that scope
reads and writes to `auth.uid()`. Bookmarks, saved ideas, notifications and
subscriptions are private to their owner; the `hackathons` table is world-readable
because it is public catalogue data.

The `service_role` key **bypasses RLS** and is server-only. It must never reach
the browser. The browser only ever sees the `anon` key.

---

## Deployment

### Single server (recommended for the JSON store)

```bash
npm ci
npm run build          # emits dist/
npm start              # Express serves the API and dist/
```

Set at minimum `NODE_ENV=production`, `JWT_SECRET`, `CRON_SECRET`,
`CORS_ORIGINS`, and `STORE_DRIVER=local` if you are keeping the file store. Run
behind a TLS-terminating reverse proxy (nginx, Caddy) with a process supervisor
(systemd, pm2).

Note that the local JSON store is **single-process only**. For more than one
instance, use Supabase.

### Serverless

The in-process scheduler does not survive a serverless freeze, so disable it and
drive syncs from the platform's own cron:

```json
{ "crons": [{ "path": "/api/cron/sync", "schedule": "*/30 * * * *" }] }
```

Send `x-cron-secret: $CRON_SECRET` from the platform's scheduler.

### Static hosting

`npm run build` emits a fully static `dist/`. It works on any static host, but
the API must be reachable — set `VITE_API_PROXY_TARGET` at build time to point at
your deployed API, or serve both from one origin.

### Health checks

`GET /api/health` is mounted **before the rate limiter**, so uptime probes are
never the thing that gets rate-limited. It returns `503` when the store is
unreachable.

---

## Testing

```bash
npm test          # 333 tests, 8 files
npm run lint      # 0 errors, 0 warnings
```

| Suite | Covers |
|---|---|
| `dates.test.js` | Parsing, timezone handling, countdowns |
| `classify.test.js` | Category/technology/format/country inference |
| `dedupe.test.js` | Cross-source duplicate merging |
| `search.test.js` | Query matching, every filter, every sort, pagination |
| `normalize.test.js` | Field clamping, sanitisation, URL safety |
| `projectIdeas.test.js` | Generation, distinctness, difficulty inference |
| `unstop.test.js` | Unstop payload shapes — see below |
| `api.test.js` | Full HTTP integration via Supertest |

Two notes on how the tests are built:

- **Fixtures come in two shapes on purpose.** `makeHackathon` is snake_case (the
  datastore/storage shape); `makeNormalized` is camelCase (the pipeline's output,
  which is what `classify`, `dedupe`, `search` **and** `store.upsertHackathons`
  all consume). Confusing the two makes tests assert nothing.
- **`tests/unstop.test.js` uses fixtures trimmed from live API responses**, not
  invented ones, because its purpose is to pin the wire format. Three live bugs
  are guarded there: skills keyed `skill_name`, `filters` being audience rather
  than themes, and rules-only descriptions.

Several real bugs were found by writing these tests, including substring search
matching `ai` inside "blockchain", non-total sorters causing records to appear on
two pages, and a Zod schema silently stripping `hackathonId` so every idea
generation 404'd.

---

## Project structure

```
server/
  config.js            environment parsing, all defaults
  index.js             app assembly, createApp() exported for tests
  scheduler.js         in-process cron
  lib/                 dates, text, httpClient, logger, events, routeHelpers
  sources/             one connector per publisher + UNAVAILABLE_SOURCES
  pipeline/            normalize, classify, dedupe, sync
  db/                  store interface, localStore, supabaseStore
  services/            search, auth, projectIdeas, ai, notifications, push, email
  routes/              hackathons, auth, user, notifications, ideas, stream, cron, meta
shared/
  taxonomy.js          14 categories, 76 technologies — one source of truth
src/
  pages/               18 routes
  components/          ui/ (shadcn restyled), motion/, layout/, feature components
  hooks/               auth, filters, realtime, notifications, hackathons
  lib/                 api client, formatting, taxonomy labels
supabase/migrations/   0001_schema.sql, 0002_rls.sql
tests/                 8 suites
```

`shared/taxonomy.js` is imported by **both** the server and the Vite client, so
a category key can never drift between what the API filters on and what the UI
offers.

---

## Honesty guarantees

These are product requirements, not nice-to-haves. They are enforced in code
and asserted in tests.

- **No fabricated data.** Every field traces to something a publisher stated.
- **Gaps are shown, not filled.** No deadline published means no deadline
  rendered — not an inferred one.
- **`unknown` is a real value.** HackerEarth publishes no event format, so its
  events are `unknown` and excluded from format filters rather than guessed.
- **Classification is labelled as inference.** Categories and technologies are
  HackRadar's reading of published text, and the UI says so.
- **No prize guarantees.** The project-ideas disclaimer is unconditional.
- **Poll intervals are stated.** The app does not claim realtime. Updates are
  pushed when a sync finishes; the sources are polled on the interval shown on
  the Data Sources page.
- **Discovery dates are not publish dates.** An event published six months ago
  and found yesterday is "New" to you, and is labelled that way.
- **Unavailable capabilities are declared.** No AI key means the UI says AI is
  not configured, rather than quietly serving rule-based output as though it were
  AI. Same for email and push.
- **Sources we did not integrate are listed, with reasons**, on the Data Sources
  page.

---

## Further reading

| Document | Contents |
|---|---|
| **[DATA_SOURCES.md](DATA_SOURCES.md)** | Every source, how it is accessed, robots/policy notes, per-source bugs, what is not integrated and why |
| `.env.example` | Every variable, commented, no secrets |
| `/data-sources` (in-app) | Live source status, last successful sync, capability notices |
| `/privacy`, `/terms`, `/about` | Plain-language policy pages |

---

## Licence

MIT. HackRadar is not affiliated with Devpost, Unstop, Devfolio, HackerEarth,
Kaggle, Major League Hacking, Supabase, or any hackathon organiser whose events
appear in the catalogue. All event data belongs to its respective publishers and
organisers, and is displayed with attribution and links back to the source.