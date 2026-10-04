# Data sources

HackRadar shows real hackathons from real publishers. Nothing in the catalogue is
invented, and no source is integrated in a way its owner has not sanctioned.

This document is the audit trail: what is integrated, how it is accessed, what it
legitimately cannot provide, and what is deliberately left out along with the
reason.

---

## Access policy

Every connector in `server/sources/` obeys the same four rules.

1. **Official or public endpoints only.** A source is integrated through its own
   documented API, a feed the publisher advertises, or JSON-LD that the publisher
   embeds in pages for machine consumption. Not one connector parses a listing
   page that exists for humans only.
2. **No authentication bypass.** If a source requires an API key, HackRadar asks
   you for your own key. It does not scrape around a login, reuse a session
   cookie, or solve a CAPTCHA.
3. **No paywall circumvention.** Content behind a paywall is not fetched.
4. **Honest identification.** Requests carry a descriptive User-Agent naming
   HackRadar and, if you set `SOURCE_USER_AGENT`, your own URL. Per-source
   intervals are deliberately slow, and `robots.txt` was read for each host
   before the connector was written.

Sources are polled on independent intervals (`SYNC_INTERVAL_*`, minutes) rather
than a single global cron, because they have different publication rates. A
source is only re-fetched once its own interval has elapsed since its last
successful run.

---

## Integrated sources

### Devpost

| | |
|---|---|
| **Integration** | Public JSON API |
| **Endpoint** | `https://devpost.com/api/hackathons?status[]=open&status[]=upcoming&page=N` |
| **Terms** | <https://devpost.com/terms> |
| **Pagination** | 9 per page |
| **Credentialed** | No |
| **Default interval** | 45 minutes |

Devpost is the highest-quality source HackRadar uses. Its API returns title,
organiser, dates, prize, location, themes, technologies and application counts
without authentication.

Detail enrichment is **lazy and budgeted**, not eager. Fetching every event page
on every run would be hundreds of extra requests for data most users never look
at, so each sync enriches at most `SYNC_ENRICHMENT_BUDGET` (default 40) events,
and opening a detail page triggers an on-demand fetch for that one event.

The detail parser prefers the page's JSON-LD `description` when it is at least
200 characters of real text, and falls back to the visible HTML sections
otherwise. Eligibility is taken verbatim from the `#eligibility-list` items
rather than summarised, so the UI never paraphrases who may enter.

**Known limitation.** Devpost does not publish a "registration closes" date
distinct from the event start. Where no explicit deadline exists the field is
stored as `null` and the UI omits it, rather than inventing one.

### Unstop

| | |
|---|---|
| **Integration** | Public JSON API |
| **Endpoint** | `https://unstop.com/api/public/opportunity/search-result?opportunity=hackathons&oppstatus=open&page=N` |
| **Terms** | <https://unstop.com/terms> |
| **Pagination** | 10 per page |
| **Credentialed** | No |
| **Default interval** | 90 minutes |

Unstop's `robots.txt` contains an explicit `Allow: /api/public/*` directive, so
this path is sanctioned for automated access. The payload is the same JSON the
public hackathon listing renders in the browser. HackRadar reads only publicly
listed, registration-open hackathons.

This connector needed the most care, and three of its bugs were real and are
now covered by tests in `tests/unstop.test.js`:

- **`required_skills` are keyed `skill_name`.** The generic `cleanTagList()`
  helper looks for `name`/`title`/`label`, so passing these objects through
  unchanged produced an *empty technology list for every Unstop event*. Unstop
  is the single largest source in the catalogue by country, so this silently
  stripped technology data from hundreds of records. `skillNames()` now reads
  the correct key.
- **`filters` are audience facets, not themes.** They contain values like
  "Engineering Students", "Postgraduate", "Fresher". Feeding them into `themes`
  meant the classifier read "Management" and "Law" as the subject matter of every
  Indian event — wrong, and invisible in the UI because the categories still
  looked plausible. They now go to `eligibility`, where they are genuinely
  useful. **Unstop contributes zero themes**, because it publishes none.
- **Some listings publish only rules.** CodeStorm 2026's description is 100%
  headings and bullets ("Guidelines:", "• Eligibility: Open to all…"). Truncating
  that into a card summary produced text that read like a form. `summarise()`
  now extracts the first real prose paragraph, and returns `null` when there is
  none — so the card says the organiser published no description instead of
  showing a wall of rules.

**Known limitation.** Unstop's skill tags are flagged `pivot.ai_generated:
true` in the payload. They are what the organiser's own listing displays, so
HackRadar keeps them, but they are Unstop's inference rather than a stated
requirement, and they are never treated as eligibility.

### Devfolio

| | |
|---|---|
| **Integration** | Public JSON API |
| **Endpoint** | `https://api.devfolio.co/api/hackathons?page=N` |
| **Pagination** | 1000 per page (large payload — see note) |
| **Credentialed** | No |
| **Default interval** | 240 minutes |

Devfolio returns up to 1000 records per page; a single page is roughly 7 MB, so
this source is the slowest to sync and is limited to `SYNC_MAX_PAGES_DEVFOLIO`
(default 3).

Devfolio's archive includes events from many years back, which dilutes the
catalogue and makes "recently discovered" meaningless. The connector therefore
applies a **recency filter**: archive entries whose end date is more than 12
months old, or which carry no date at all, are dropped. On a full run this takes
1000 records down to 391 usable ones.

### HackerEarth

| | |
|---|---|
| **Integration** | Public endpoint used by the site's own Chrome extension |
| **Endpoint** | `https://www.hackerearth.com/chrome-extension/events/` |
| **Pagination** | None — the endpoint returns 6 events |
| **Credentialed** | No |
| **Default interval** | 180 minutes |

HackerEarth has no public REST API. This endpoint is what the official
HackerEarth Chrome extension calls, and it is a documented machine-readable
interface rather than a human-facing listing page.

**Known limitation.** It returns 6 events with no pagination and no detail. Every
field HackerEarth does not publish is stored as `null`. `eventFormat` is set to
`'unknown'` rather than guessed — see the honesty note below.

### Kaggle (optional, credential-gated)

| | |
|---|---|
| **Integration** | REST API, HTTP Basic auth |
| **Endpoint** | `https://www.kaggle.com/api/v1/competitions/list` |
| **Credentialed** | **Yes** |
| **Default interval** | 720 minutes |

Kaggle's API returns `401 Unauthorized` without credentials. Rather than scrape
around the login, the connector is implemented but **disabled by default**. Set
`KAGGLE_USERNAME` and `KAGGLE_KEY` to enable it. It contributes nothing to the
catalogue until you do.

---

## Deliberately not integrated

These are listed in the app itself, under **Data Sources**, so the coverage story
is explicit rather than implied by silence.

### Major League Hacking (MLH)

MLH publishes **no public API, no RSS feed and no JSON export**. Its event
directory is a server-rendered HTML page, so integrating it would mean scraping.
HackRadar does not do that.

The practical impact is smaller than it sounds: MLH events are very frequently
cross-posted on Devpost, which HackRadar does integrate, so most of them still
appear in the catalogue.

### Hack2Skill

Hack2Skill is a client-rendered single-page app with no public API, feed or
server-rendered listing. There is no permitted machine-readable integration
path, so it is not integrated.

### Kaggle without credentials

Listed separately from the others because it is not a decision — it is a
configuration state. See above.

---

## Why some fields are empty

An empty field means the publisher did not tell us. HackRadar does not fill gaps
with plausible guesses.

| Field | Why it is often empty |
|---|---|
| `registrationDeadline` | Devpost and Devfolio do not publish a registration-close date distinct from the event start |
| `judgingCriteria` | Only Devpost publishes it, and only on enriched detail pages |
| `teamSize` | Published by Unstop only |
| `eligibility` | Free text, and highly variable in structure between sources |
| `bannerUrl` | Some organisers publish no banner. HackerEarth publishes none at all |

### A note on `eventFormat`

`eventFormat` is one of `online`, `offline`, `hybrid`, or `unknown`.

`unknown` is a real value, not a fallback for laziness. HackerEarth publishes no
format information whatsoever, and inferring "online" from the absence of an
address would be a fabrication — the event could equally be in-person at a
venue HackerEarth does not record. Events with `unknown` format are excluded
from online/offline/hybrid filters rather than being guessed into one of them.

### A note on `eligibilityLevel`

HackRadar maps to `beginner` / `intermediate` / `advanced` only when the source
**explicitly states** a seniority requirement. A mixed audience menu — Unstop
ticking both "Experienced Professionals" and "Fresher" — resolves to no level at
all, because "entrants are welcome" is not a claim about difficulty. `null` is
returned in that case and the filter excludes the event, which is the honest
outcome.

---

## What the three timestamps mean

The data model separates three dates that people routinely conflate. Every
hackathon carries all three, and the UI labels each one:

| Field | Meaning | Set by |
|---|---|---|
| `sourcePublishedAt` | When the **organiser** published the event | The source's own publish/approved timestamp |
| `firstDiscoveredAt` | When **HackRadar** first saw it | Set once, never overwritten |
| `updatedAt` | When the record last changed | Bumped on every upsert |

`firstDiscoveredAt` is what powers the **"New"** badge and the `newly-added`
filter. It is deliberately *not* the organiser's publish date: an event published
six months ago and discovered by HackRadar yesterday is genuinely new *to you*,
and labelling it by the organiser's date would hide it.

A record also carries `lastVerifiedAt`, meaning the last time the source
confirmed it still exists.

---

## Sync behaviour

### Schedule

`server/scheduler.js` runs an in-process node-cron job on `SYNC_CRON`
(default `*/30 * * * *`). Each source is additionally rate-limited by its own
`SYNC_INTERVAL_*`. `SYNC_RUN_ON_BOOT=true` fetches everything once at startup so
a fresh clone has data without waiting.

On a serverless host, disable the in-process scheduler and call
`POST /api/cron/sync` from the platform's own cron instead. The endpoint requires
the `CRON_SECRET` header when set, and **should be set in production** —
otherwise anyone on the internet can trigger a sync.

### What one run does

1. **Fetch** — each due source is fetched concurrently, bounded by
   `mapLimit`. A source that fails is logged and retried with exponential
   backoff; one bad source never fails the run.
2. **Normalise** — every raw record becomes the same shape: `sourceName`,
   `sourceEventId`, canonical slugs, cleaned text, absolute dates, sanitised
   URLs.
3. **Classify** — category, technologies, format, country and eligibility are
   derived by word-boundary keyword matching against the shared taxonomy. This
   is inference and it is labelled as such: classifications are HackRadar's
   reading of published text, not statements by the organiser.
4. **Dedupe** — cross-source duplicates are merged by slug, then by normalised
   title similarity (Jaccard over content tokens). Clusters are recorded so the
   surviving record can point at its duplicates.
5. **Upsert** — records are written by `(sourceName, sourceEventId)` so a record
   is never duplicated by a re-sync.
6. **Re-status** — events whose published end date has passed (and which had
   actually started) are transitioned to `completed`. This is derived purely from
   the organiser's own dates, so it does not depend on the source continuing to
   list the event. Records are never deleted by a sync: a source that stops
   returning an event does not erase it, because a transient listing outage
   should not empty the catalogue.
7. **Log** — every run writes a row to `sync_logs`: per-source counts, inserted
   vs updated, enrichment attempts, errors, and duration.

The last successful sync timestamp is surfaced in the UI. If a sync fails, the UI
says so and shows the previous successful time — it never displays a stale
catalogue as though it were live.

### Realtime

Updates are pushed over **Server-Sent Events** at `GET /api/stream`, which is
always available and needs no credentials. When Supabase is configured, its
Realtime channel is used as well.

Event types: `hello`, `inserted`, `updated`, `expired`, `sync`.

**On honesty about "live":** this is push from the server when a sync completes.
It is not a guarantee that a source has published something one second ago —
HackRadar cannot know that until it polls. The UI reflects this: there is a
connection indicator, and the data-sources page states the poll interval. The
application never claims to be instant.

---

## Adding a source

1. Create `server/sources/your-source.js` implementing the contract documented at
   the top of `server/sources/index.js`.
2. Set `integration` accurately. Use `public-endpoint` if the endpoint is not a
   vendor-documented API — the field exists so the UI can tell users the
   difference.
3. Write a `note` stating anything a reader should know: rate limits, missing
   fields, why the source is credential-gated.
4. Register it in `SOURCES` in `server/sources/index.js`.
5. Add `SYNC_INTERVAL_YOURSOURCE` and `SYNC_MAX_PAGES_YOURSOURCE` to
   `.env.example` and `server/config.js`.
6. If you are *not* integrating it, add it to `UNAVAILABLE_SOURCES` with the
   reason. **Do not leave a gap in the catalogue unexplained.**
7. Add tests with fixtures copied from a real response.

---

## Verifying the current state

```bash
npm run sync        # fetch every enabled source
curl localhost:8787/api/meta | jq '.sources'      # what is enabled and why
curl localhost:8787/api/hackathons?limit=1 | jq '.counts'
```

The Data Sources page in the running app shows the same information live,
including the last successful sync time per source.