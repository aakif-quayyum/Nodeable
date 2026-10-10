# Nodeable — Software Specification

Oct 8, 2026 · @Aakif

## 1. Overview

Nodeable is a music discovery web app that maps the producers, songwriters, engineers and session musicians behind the songs a user loves, then recommends new music through those people. It doubles as a portfolio flagship that demonstrates React, MUI, D3, .NET, real-time streaming and OpenTelemetry in one coherent product.

### Problem

Streaming apps recommend music through "similar artists" algorithms. Music lovers often discover music a different way: by noticing who produced, wrote or played on a song. That information exists in open databases like MusicBrainz, but it is scattered, slow to query and never visualised.

### Goals

1. Let a user add songs they love and see the hidden network of people behind them within 60 seconds.
2. Turn that network into useful discovery: ranked recommendations with a reason for each.
3. Give users a reason to return, through producer follow alerts and shareable graphs.
4. Showcase production-grade engineering: rate-limited ingestion, caching, real-time updates and full observability.
5. Stretch the author beyond a JavaScript and Node.js background into C#, .NET, TypeScript and modern DevOps tooling.

### Non-goals

- Streaming or hosting full audio. The app links out and plays licensed 30-second previews only.
- Becoming a general music database or editor. Credit corrections go back to MusicBrainz.
- Native mobile apps. The web app is responsive and works on phones.
- Monetisation.

### Success metrics

| Metric | Target |
| --- | --- |
| Time from first song added to first hub visible | Under 10 s for cached songs, under 60 s for 15 uncached songs |
| Recommendations saved per session | At least 3 for a returning user |
| Graph page interaction | Smooth at 60 fps with 500 nodes |
| API availability SLO | 99.5% monthly |
| Test coverage of domain logic | At least 80% |

### How to use this document

This is a spec-driven development document: the spec is the source of truth, and code follows it. Every requirement has an ID (for example FR-GRAPH-01). Plans, tasks, pull requests and tests reference those IDs. When behaviour needs to change, update the spec first, then the code. The flow is: specify (sections 3 to 5), plan (sections 6 to 13), then break into tasks (section 14).

## 2. Project principles

These rules apply to every spec change, plan and task. A pull request that breaks one needs a decision log entry (section 15) explaining why.

1. **Spec first.** No feature code merges without a requirement ID it implements and an acceptance test that proves it.
2. **Respect the data sources.** Never exceed MusicBrainz or Discogs rate limits, always send an identifying User-Agent, and cache aggressively so each external record is fetched once.
3. **Never make the user wait on a blank screen.** Slow work runs in the background and streams partial results to the browser.
4. **Observable by default.** Every external call, background job and API endpoint emits traces, metrics and structured logs from day one, not as an afterthought.
5. **Honest data.** Missing or incomplete credits are shown as incomplete, never hidden or guessed.
6. **Typed end to end.** C# on the backend and TypeScript on the frontend, with API types generated from the OpenAPI contract rather than written by hand.
7. **Accessible.** Every visualisation has a keyboard path and a text alternative, and the app meets WCAG 2.2 AA.
8. **Reproducible.** One command starts the full stack locally, and every environment is built from code.

## 3. Personas and user stories

Three personas drive the requirements: a curious listener, a music nerd who digs into credits, and a technical reviewer evaluating the portfolio.

| Persona | Who they are | What they want |
| --- | --- | --- |
| Curious listener | Listens daily, has never looked at song credits | New music that feels personal, with little effort |
| Credits digger | Reads liner notes, follows producers | Deep exploration, career histories, alerts on new work |
| Technical reviewer | Interviewer or hiring manager | Proof of engineering quality in under 5 minutes |

### User stories

**US-01 Build my graph.** As a curious listener, I want to add songs I love so that I can see who made them.

- Given I am on the home page, when I search "Redbone", then I see matching recordings with artist, release and year within 1 second.
- Given I add a song, when its credits are not cached, then the song node appears immediately and its people appear one by one as they load.
- Given a song has no producer or writer credits, then it shows a "credits incomplete" badge with a link to edit it on MusicBrainz.

**US-02 Find the hubs.** As a curious listener, I want to see which people connect several of my songs.

- Given my graph has 10 or more songs, when a person is credited on 2 or more of them, then their node is sized by that count and listed in a "Your hubs" panel.
- Given I filter by role "Producer", then only producer credits and their connected songs stay visible.

**US-03 Discover through a person.** As a credits digger, I want to click a person and see their other work ranked by relevance to my taste.

- Given I click a hub, then a drawer opens with their role summary, active years and a ranked list of other recordings.
- Given a recommendation, then it states why it is recommended (for example "3 of your hub producers worked on this").
- Given I click a preview button, then a 30-second clip plays in the app.

**US-04 Save and export.** As a curious listener, I want to save discoveries and export them as a playlist.

- Given I am signed in, when I save a recording, then it appears in my Discovery list across devices.
- Given my list has items, when I choose Export to Spotify, then a playlist is created in my Spotify account.

**US-05 Six degrees.** As a credits digger, I want to find how two artists are connected.

- Given I pick two artists, when a path of 6 hops or fewer exists in the cache, then I see it drawn as a chain within 2 seconds.
- Given no path is found, then the app says so and offers to crawl further in the background.

**US-06 Producer radar.** As a credits digger, I want to follow a person and hear about their new work.

- Given I follow a person, when a new release crediting them appears in MusicBrainz, then I get an in-app notification and an optional email within 24 hours.

**US-07 Share my graph.** As any user, I want to share my graph with a link.

- Given I make a graph public, then anyone with the link can view it read-only, and a preview image is generated for social cards.

**US-08 See how it is built.** As a technical reviewer, I want to understand the engineering quickly.

- Given I open the About page, then I see an architecture diagram, a live crawl status panel driven by real telemetry, and links to the code and this spec.

## 4. Functional requirements

Requirements are grouped by release phase. The MVP is the smallest version that delivers US-01 to US-03 and US-08 end to end; v2 adds retention and social features; v3 adds the showpiece extras.

### MVP

| ID | Requirement | Story |
| --- | --- | --- |
| FR-SEARCH-01 | Search recordings by title and optional artist, returning up to 10 matches with artist, first release title, year and match score | US-01 |
| FR-SEARCH-02 | Collapse duplicate recordings (live, remaster, compilation) behind the earliest official release, with an option to expand | US-01 |
| FR-GRAPH-01 | A graph holds 1 to 50 songs; anonymous graphs persist in the browser, signed-in graphs persist on the server | US-01 |
| FR-GRAPH-02 | Adding a song shows its node immediately and streams credit nodes as they resolve | US-01 |
| FR-GRAPH-03 | Credits are resolved from recording, work and release relationships, deduplicated per person and role | US-01 |
| FR-GRAPH-04 | Songs with no producer and no writer credit show a "credits incomplete" badge linking to MusicBrainz | US-01 |
| FR-HUB-01 | Person nodes are sized by the number of graph songs they are credited on | US-02 |
| FR-HUB-02 | A "Your hubs" panel lists people credited on 2 or more songs, sorted by count | US-02 |
| FR-HUB-03 | Role filters toggle producer, songwriter, mixing, engineering, instrument and vocal credits | US-02 |
| FR-PERSON-01 | Clicking a person opens a drawer with role summary, active years and credited recordings | US-03 |
| FR-REC-01 | Recommendations rank recordings by the number of graph hubs credited on them, excluding songs already in the graph | US-03 |
| FR-REC-02 | Each recommendation shows a plain-language reason | US-03 |
| FR-PREVIEW-01 | Recordings play a 30-second preview when one is available from Deezer | US-03 |
| FR-ABOUT-01 | An About page shows the architecture, a live crawl status panel from real telemetry, and links to the repository and spec | US-08 |

### v2

| ID | Requirement | Story |
| --- | --- | --- |
| FR-AUTH-01 | Users sign in with email or Google; anonymous graphs migrate to the account on first sign-in | US-04 |
| FR-SAVE-01 | Signed-in users save recordings to a Discovery list synced across devices | US-04 |
| FR-EXPORT-01 | Export the Discovery list as M3U or CSV with per-track open links; allowlisted accounts can also create a Spotify playlist via OAuth | US-04 |
| FR-PATH-01 | Find the shortest collaborator path between two artists, up to 6 hops, over cached data | US-05 |
| FR-PATH-02 | When no path exists in the cache, offer a background deep crawl and notify on completion | US-05 |
| FR-RADAR-01 | Users follow people; a scheduled job checks followed people for new releases daily | US-06 |
| FR-RADAR-02 | New credits create in-app notifications and optional email digests | US-06 |
| FR-SHARE-01 | Graphs can be made public with a read-only link and an Open Graph preview image | US-07 |
| FR-ENRICH-01 | Discogs fills credits when MusicBrainz has none for a release | US-01 |

### v3

| ID | Requirement | Story |
| --- | --- | --- |
| FR-HEROES-01 | "Unsung heroes" ranks session musicians and engineers on the user's songs whom the user has never searched | US-02 |
| FR-TREE-01 | A song family tree shows covers, samples and remixes from MusicBrainz relationships | US-03 |
| FR-MAP-01 | A studio map plots where the user's songs were recorded | US-02 |
| FR-TIMELINE-01 | A person's career timeline shows credits by year, with collaborators and roles | US-03 |
| FR-COMPARE-01 | Two users' graphs can be overlaid to show shared hubs | US-07 |
| FR-QUIZ-01 | A "guess the producer" quiz built from cached credits and previews | US-03 |

## 5. Non-functional requirements

The hardest non-functional constraint is the MusicBrainz limit of about one request per second, so performance targets are split between cached and uncached work.

| ID | Area | Requirement |
| --- | --- | --- |
| NFR-PERF-01 | Performance | Search responds in under 1 s at p95 |
| NFR-PERF-02 | Performance | A fully cached song's credits load in under 300 ms at p95 |
| NFR-PERF-03 | Performance | The graph renders 500 nodes at 60 fps on a mid-range laptop and 30 fps on a mid-range phone |
| NFR-PERF-04 | Performance | Initial page load under 2.5 s Largest Contentful Paint on 4G |
| NFR-RATE-01 | External limits | All MusicBrainz calls pass through one global rate gate at 1 request per second, across every API instance |
| NFR-RATE-02 | External limits | Discogs calls stay under 60 requests per minute with an authenticated token |
| NFR-RATE-03 | External limits | 503 and 429 responses trigger exponential backoff with jitter, up to 5 retries |
| NFR-REL-01 | Reliability | Crawl jobs survive an API restart and resume from the queue |
| NFR-REL-02 | Reliability | Monthly availability of 99.5% for the public API |
| NFR-REL-03 | Reliability | Cached credits are refreshed when older than 30 days, in the background |
| NFR-SEC-01 | Security | Secrets are never committed; local development uses user secrets, production uses the host's secret store |
| NFR-SEC-02 | Security | Public endpoints are rate limited per IP: 60 searches per minute, 20 song additions per minute |
| NFR-SEC-03 | Security | OAuth tokens for Spotify are encrypted at rest and never sent to the browser |
| NFR-SEC-04 | Security | Dependencies are scanned on every pull request |
| NFR-A11Y-01 | Accessibility | WCAG 2.2 AA; the graph has a keyboard-navigable list view with the same data |
| NFR-A11Y-02 | Accessibility | Colour is never the only carrier of meaning; role colours also use icons or patterns |
| NFR-OBS-01 | Observability | Every request and job is traced end to end, from browser click to external API call |
| NFR-PRIV-01 | Privacy | No tracking cookies; analytics are first-party and anonymous |
| NFR-COST-01 | Cost | The production stack runs for under USD 25 per month at portfolio traffic |

## 6. Tech stack and learning goals

The stack keeps React, MUI and D3 at the centre and deliberately adds tools outside a JavaScript and Node.js comfort zone: C# and .NET 10, TypeScript, Aspire, the Grafana observability stack, Terraform and k6. Items marked **New** are the main learning targets.

### Frontend

| Tool | Role in the app | What it teaches |
| --- | --- | --- |
| React 19 + Vite | App shell, routing, components | Modern React patterns: Suspense, transitions |
| TypeScript (**New**) | Typed components and API client | Static typing, generics, discriminated unions |
| Material UI v9 | Layout, drawers, search, filters, theming | Design tokens, dark theme, accessible components |
| D3 v7 | Force graph, zoom, timelines, maps | Force simulation, scales, canvas rendering |
| TanStack Query (**New**) | Server state, caching, background refetch | Separating server state from UI state |
| Zustand (**New**) | Graph UI state: selection, filters | Lightweight state as an alternative to Redux |
| SignalR JS client (**New**) | Live credit stream | WebSocket fallbacks and reconnection |
| openapi-typescript (**New**) | Generated API types | Contract-first development |
| OpenTelemetry Web SDK | Browser traces linked to backend traces | End-to-end trace propagation |

### Backend

| Tool | Role in the app | What it teaches |
| --- | --- | --- |
| C# and .NET 10 LTS (**New**) | API and workers | A second backend language and ecosystem |
| ASP.NET Core Minimal APIs | REST endpoints, OpenAPI document | Dependency injection, middleware, endpoint filters |
| SignalR (**New**) | Push credit nodes and crawl progress | Real-time hubs, groups, Redis backplane |
| EF Core 10 + Npgsql (**New**) | Data access and migrations | ORM, migrations, raw SQL where it matters |
| BackgroundService + PostgreSQL job table | Durable crawl queue | Work queues with `FOR UPDATE SKIP LOCKED` |
| Hangfire (**New**) | Scheduled jobs: radar, cache refresh | Recurring jobs with a built-in dashboard |
| Microsoft.Extensions.Http.Resilience (**New**) | Retries, backoff, circuit breaker | Resilience pipelines built on Polly |
| ASP.NET Core Identity + Google login | Accounts and sessions | Cookie auth, external providers |

### Data

| Tool | Role in the app | What it teaches |
| --- | --- | --- |
| PostgreSQL | Songs, people, credits, users, jobs | Recursive CTEs for graph paths, indexing |
| Redis | Hot cache, global rate gate, SignalR backplane | Distributed token buckets, Lua scripts |

### Observability, testing and delivery

| Tool | Role in the app | What it teaches |
| --- | --- | --- |
| OpenTelemetry .NET | Traces, metrics, logs from every component | Custom spans, meters, semantic conventions |
| Aspire 13 (**New**) | One-command local stack and telemetry dashboard | Orchestration as code, service defaults |
| OpenTelemetry Collector + Grafana Cloud (**New**) | Production traces (Tempo), metrics (Prometheus), logs (Loki) | TraceQL, PromQL, dashboards, alerts |
| xUnit + Testcontainers + WireMock.Net (**New**) | Unit and integration tests with real Postgres and a fake MusicBrainz | Testing against real infrastructure |
| Vitest + React Testing Library + Playwright | Frontend unit and end-to-end tests | Component and browser testing |
| k6 (**New**) | Load tests for search and graph endpoints | Performance budgets in CI |
| Docker + GitHub Actions | Build, test, publish images | CI pipelines, image scanning |
| Terraform + a small VPS with Caddy (**New**) | Production infrastructure | Infrastructure as code, TLS, Linux ops |

Version notes: [.NET 10 is the current LTS release, supported until November 14, 2028](https://dotnet.microsoft.com/en-US/platform/support/policy). [Material UI jumped from v7 straight to v9 in April 2026 to align with MUI X](https://mui.com/blog/introducing-mui-v9/). [The Aspire dashboard shows logs, traces and metrics from OpenTelemetry-instrumented apps](https://aspire.dev/hub/glossary/aspire-dashboard/).

Versions M1 was built and tested against: .NET SDK 10.0 (pinned in `global.json`), Aspire 13.6, EF Core 10.0, Npgsql provider 10.0, PostgreSQL 18 and Redis 8.6 (Aspire's defaults), React 19.2, Vite 8, TypeScript 6.0, Material UI 9.5, React Router 8, TanStack Query 5, ESLint 9. TypeScript stays below 6.1 and ESLint at 9 until typescript-eslint and `eslint-plugin-jsx-a11y` support more (decision 0001).

## 7. System architecture

The system is two .NET processes, an API and a Worker, sharing PostgreSQL and Redis; only the Worker talks to external APIs, so one place enforces the MusicBrainz rate limit. The API never waits on MusicBrainz: it queues work and returns immediately.

&#91;embedded content: system architecture · 8 components\]

Solid arrows carry requests and data; dashed arrows carry telemetry to the Collector, which forwards it to Grafana Cloud in production and the Aspire dashboard locally.

### Flow: adding a song

1. The browser sends `POST /graphs/{id}/songs` with a `traceparent` header.
2. The API checks PostgreSQL. Cached credits return in the response and the flow ends.
3. Otherwise the API inserts up to four `crawl_jobs` rows (recording, work, release, preview), stores the trace context on each, and returns 202 with the song node.
4. The Worker claims jobs with `FOR UPDATE SKIP LOCKED`, highest priority first, and waits for a token from the Redis rate gate.
5. The Worker fetches from MusicBrainz, maps relationships to roles, and upserts `people` and `credits`.
6. The Worker publishes `CreditsResolved` and `HubsUpdated` through SignalR, using the Redis backplane, to every client in the graph's group.
7. The browser merges each event into the TanStack Query cache, and new nodes animate into the graph.

### Flow: scheduled work

- Hangfire runs producer radar checks and stale-cache refreshes, spreading individual checks at random times across the day as MusicBrainz asks.
- Scheduled jobs use the same `crawl_jobs` queue at a lower priority, so interactive users always go first.

## 8. Data model

All music data is keyed by MusicBrainz IDs (MBIDs), and every credit is stored once in a single `credits` table regardless of whether it came from a recording, a work or a release. A view flattens those three levels into "who is credited on this recording", which every graph feature reads.

### Tables

| Table | Purpose | Key columns |
| --- | --- | --- |
| `recordings` | A specific performance of a song | `mbid` PK, `title`, `artist_credit`, `first_release_date`, `length_ms`, `credits_status` (complete, partial, none), `fetched_at` |
| `works` | The underlying composition | `mbid` PK, `title`, `fetched_at` |
| `releases` | Albums and singles | `mbid` PK, `title`, `date`, `fetched_at` |
| `recording_works` | Recording to work links | (`recording_mbid`, `work_mbid`) PK |
| `recording_releases` | Recording to release links | (`recording_mbid`, `release_mbid`) PK |
| `people` | Artists, producers, engineers, musicians | `mbid` PK, `name`, `sort_name`, `type`, `disambiguation`, `fetched_at` |
| `credits` | One person, one role, on one subject | `id` PK, `person_mbid`, `subject_type` (recording, work, release), `subject_mbid`, `role`, `detail` (never null, empty string when there is none), `source` (musicbrainz, discogs) |
| `previews` | A recording's track at a preview provider; only the track ID is stored | (`recording_mbid`, `provider`) PK, `provider_track_id`, `fetched_at` |
| `graphs` | A user's set of songs | `id` PK, `owner_id` (nullable), `anon_token_hash` (SHA-256 of the token, decision 0007), `name`, `is_public`, `share_slug` |
| `graph_songs` | Songs in a graph | (`graph_id`, `recording_mbid`) PK, `added_at` |
| `crawl_jobs` | Durable queue of external fetches | `id` PK, `kind` (recording, work, release, preview, artist), `target_mbid`, `priority`, `status` (pending, running, done, failed), `attempts`, `run_after`, `locked_by`, `locked_at`, `last_error`, `traceparent` |
| `saved_recordings` | Discovery list (v2) | (`user_id`, `recording_mbid`) PK, `saved_at`, `reason` |
| `follows` | Producer radar (v2) | (`user_id`, `person_mbid`) PK, `last_checked_at` |
| `notifications` | In-app alerts (v2) | `id` PK, `user_id`, `kind`, `payload` jsonb, `read_at` |

User accounts use the standard ASP.NET Core Identity tables. The `traceparent` column on `crawl_jobs` stores the W3C trace context of the request that queued the job, so a background fetch appears in the same trace as the click that caused it.

### Conventions

- Tables and columns are `snake_case`; MusicBrainz IDs are `uuid`; timestamps are `timestamptz`.
- Enumerated columns (`credits_status`, `subject_type`, `role`, `source`, `provider`, and the crawl job `kind` and `status`) are lower-case text with a CHECK constraint listing the allowed values (decision 0006).
- Foreign keys are declared wherever the target is a single table: link tables to `recordings`, `works` and `releases`; `credits.person_mbid` to `people`; `previews.recording_mbid` to `recordings`; `graph_songs` to `graphs` (cascade) and `recordings`. `credits.subject_mbid` and `crawl_jobs.target_mbid` are polymorphic and have none. The ingestion order in M2 follows from this: a recording or person row exists before rows that reference it.
- `graphs.owner_id` has no foreign key until ASP.NET Core Identity arrives in v2.
- Schema changes go through EF Core migrations, applied at Api startup in Development and as a separate step in production (decision 0003).

### Indexes and constraints

- `credits`: unique on (`person_mbid`, `subject_type`, `subject_mbid`, `role`, `detail`) to make re-crawls idempotent (`detail` is never null, because PostgreSQL treats NULLs as distinct in a unique index); index on (`subject_type`, `subject_mbid`). A separate index on `person_mbid` is not needed: the unique index starts with that column and serves the same lookups.
- `crawl_jobs`: unique on (`kind`, `target_mbid`) where `status` is pending or running, so the same fetch is never queued twice; partial index on (`priority` desc, `run_after`) where `status = 'pending'`.
- `recordings.title`: trigram index (`pg_trgm`) for fast local search before falling back to MusicBrainz.

### Key queries

The flattened view joins credits from all three levels onto a recording:

```sql
CREATE VIEW recording_people AS
SELECT c.subject_mbid AS recording_mbid, c.person_mbid, c.role, c.detail, 'recording' AS level
FROM credits c WHERE c.subject_type = 'recording'
UNION ALL
SELECT rw.recording_mbid, c.person_mbid, c.role, c.detail, 'work'
FROM recording_works rw JOIN credits c ON c.subject_type = 'work' AND c.subject_mbid = rw.work_mbid
UNION ALL
SELECT rr.recording_mbid, c.person_mbid, c.role, c.detail, 'release'
FROM recording_releases rr JOIN credits c ON c.subject_type = 'release' AND c.subject_mbid = rr.release_mbid;
```

Hubs for a graph (FR-HUB-01, FR-HUB-02):

```sql
SELECT rp.person_mbid, COUNT(DISTINCT rp.recording_mbid) AS songs, ARRAY_AGG(DISTINCT rp.role) AS roles
FROM graph_songs gs JOIN recording_people rp ON rp.recording_mbid = gs.recording_mbid
WHERE gs.graph_id = @graphId
GROUP BY rp.person_mbid
HAVING COUNT(DISTINCT rp.recording_mbid) >= 2
ORDER BY songs DESC;
```

Six degrees (FR-PATH-01) runs as a bidirectional breadth-first search in C# over an in-memory adjacency list loaded from `recording_people`, capped at 6 hops. A recursive CTE is the fallback for small graphs. If the cache grows past roughly 1 million credits, revisit this with a graph extension such as Apache AGE (see section 15).

## 9. API contracts

The API is REST over JSON under `/api/v1`, described by an OpenAPI document generated by ASP.NET Core and published at `/openapi/v1.json`; the frontend's types are generated from it. Real-time updates use one SignalR hub at `/hubs/graph`.

### REST endpoints

| Method | Path | Purpose | Requirement |
| --- | --- | --- | --- |
| GET | `/api/v1/search/recordings?q=&artist=` | Search recordings, local cache first, then MusicBrainz | FR-SEARCH-01, 02 |
| POST | `/api/v1/graphs` | Create a graph; returns `id` and, for anonymous users, an `anonToken` | FR-GRAPH-01 |
| GET | `/api/v1/graphs/{id}` | Graph with songs, people, credits and hubs | FR-GRAPH-01, FR-HUB-01 |
| POST | `/api/v1/graphs/{id}/songs` | Add a recording by MBID; returns 202 with the song node and queues credit crawls | FR-GRAPH-02 |
| DELETE | `/api/v1/graphs/{id}/songs/{mbid}` | Remove a song | FR-GRAPH-01 |
| GET | `/api/v1/people/{mbid}` | Person profile with role summary and active years | FR-PERSON-01 |
| GET | `/api/v1/people/{mbid}/recordings?page=` | Paged credited recordings | FR-PERSON-01 |
| GET | `/api/v1/graphs/{id}/recommendations?limit=20` | Ranked recommendations with reasons | FR-REC-01, 02 |
| GET | `/api/v1/recordings/{mbid}/preview` | Preview URL or 404 | FR-PREVIEW-01 |
| GET | `/api/v1/status/crawl` | Queue depth, fetch rate, cache hit ratio for the About page | FR-ABOUT-01 |
| GET | `/api/v1/paths?from=&to=` | Shortest collaborator path (v2) | FR-PATH-01 |
| POST, DELETE | `/api/v1/me/saved/{mbid}` | Save or unsave a recording (v2) | FR-SAVE-01 |
| POST | `/api/v1/me/exports/spotify` | Export the Discovery list (v2) | FR-EXPORT-01 |
| POST, DELETE | `/api/v1/me/follows/{personMbid}` | Follow or unfollow a person (v2) | FR-RADAR-01 |
| PATCH | `/api/v1/graphs/{id}/sharing` | Make public and get a share slug (v2) | FR-SHARE-01 |

Anonymous graphs are authorised by an `X-Graph-Token` header holding the `anonToken`; the server stores only its hash (decision 0007). Errors use RFC 9457 Problem Details with a stable `type` URI per error, for example `/errors/rate-limited`.

The OpenAPI document is written on every build and the frontend's `web/src/api/schema.d.ts` is generated from it, committed, and checked for drift in CI (decision 0005). JSON numbers are strict, so the contract says `integer` or `number`, and a value that is not measured yet is `null`, never `0`.

`GET /api/v1/status/crawl` returns `{ queueDepth, fetchRatePerMinute, cacheHitRatio }`. `queueDepth` is the number of pending `crawl_jobs`; the other two are `null` until the Worker records the telemetry behind them (M2).

`creditsStatus` in the API takes the stored values `complete`, `partial` and `none`, plus `loading`. `loading` is not stored: the Api reports it while crawl jobs for the song are still pending or running.

### Example: add a song

```json
POST /api/v1/graphs/7c1e.../songs
{ "recordingMbid": "b1a9..." }

202 Accepted
{
  "song": { "mbid": "b1a9...", "title": "Redbone", "artist": "Childish Gambino", "creditsStatus": "loading" },
  "pendingJobs": 4
}
```

### SignalR hub events

Clients join a group per graph with `JoinGraph(graphId)`. The server sends:

| Event | Payload | When |
| --- | --- | --- |
| `CreditsResolved` | `{ songMbid, people: [{ mbid, name }], credits: [{ personMbid, role, detail, level }] }` | A recording, work or release fetch finishes |
| `SongStatusChanged` | `{ songMbid, creditsStatus }` | A song becomes complete, partial or none |
| `HubsUpdated` | `{ hubs: [{ personMbid, songs, roles }] }` | Hub counts change, debounced to once per second |
| `CrawlProgress` | `{ queued, done, failed, etaSeconds }` | Every completed job for this graph |
| `CrawlFailed` | `{ songMbid, reason }` | A job exhausts its retries |

Every message carries a monotonically increasing `seq` per graph. On reconnect the client calls `GET /graphs/{id}` and drops messages with a `seq` lower than the snapshot's.

## 10. External integrations

MusicBrainz is the primary source for all credit data; Discogs fills gaps, Deezer supplies previews, and Spotify is limited to an optional export because of its 2026 developer restrictions.

| Service | Used for | Auth | Limit | Notes |
| --- | --- | --- | --- | --- |
| MusicBrainz | Search, recordings, works, releases, people, credits | None; descriptive User-Agent required | About 1 request per second per IP; excess returns 503 | Primary source ([rate limiting](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting)) |
| Discogs | Credit enrichment when MusicBrainz has none (v2) | Personal access token | 60 per minute authenticated, 25 unauthenticated | Release `extraartists` carries roles ([API docs](https://www.discogs.com/developers)) |
| Deezer | 30-second previews | None | Public API; preview URLs expire | Match by ISRC first, then title and artist |
| Spotify | Optional playlist export (v2) | OAuth with PKCE | Development Mode only | See constraints below |

### MusicBrainz fetch plan per song

1. `GET /ws/2/recording?query=recording:"{title}" AND artist:"{artist}"` for search.
2. `GET /ws/2/recording/{mbid}?inc=artist-credits+artist-rels+work-rels+releases+isrcs` for recording-level credits, the linked work, releases and the ISRC used for preview matching.
3. `GET /ws/2/work/{workMbid}?inc=artist-rels` for composer, lyricist and writer credits.
4. `GET /ws/2/release/{releaseMbid}?inc=artist-rels` only when steps 2 and 3 found no producer.
5. `GET /ws/2/artist/{mbid}?inc=recording-rels+work-rels` when a user opens a person drawer.

Each step is a separate `crawl_jobs` row, so a failure retries only that step. The User-Agent is `Nodeable/{version} ( {contact-email} )`, the format MusicBrainz asks for.

### Role mapping

| MusicBrainz relationship type | App role |
| --- | --- |
| `producer`, `co-producer`, `executive producer` | Producer |
| `composer`, `lyricist`, `writer` | Songwriter |
| `mix`, `mix-DJ` | Mixing |
| `engineer`, `recording`, `mastering`, `sound` | Engineering |
| `instrument` (detail from attributes, for example "bass guitar") | Instrument |
| `vocal` (detail from attributes, for example "background vocals") | Vocal |

Unmapped relationship types are stored with role `Other` and their raw type in `detail`, so nothing is lost.

### Constraints that shape the spec

- **MusicBrainz discourages polling for changes and fixed-time batch jobs.** Producer radar (FR-RADAR-01) therefore checks followed people at randomised intervals spread across the day, never all at once, and the cache refresh (NFR-REL-03) is spread the same way.
- **Self-hosting removes the rate limit.** MusicBrainz publishes its database for mirroring. A self-hosted mirror is a v3 option once the cache becomes the bottleneck (section 15).
- **Spotify Development Mode is now narrow.** Since [February 2026, new Development Mode apps require the owner to have Spotify Premium, are limited to one client ID and a smaller set of endpoints](https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security), and only a small number of manually added users can authorise the app. Export therefore ships as M3U and CSV downloads with per-track open links for everyone, plus direct Spotify playlist creation for allowlisted accounts as a demo.
- **Deezer preview URLs expire.** Store the Deezer track ID and request a fresh preview URL on demand rather than caching the URL itself.

## 11. Observability

One trace follows a user's click from the browser, through the API, into the queued background jobs and out to MusicBrainz, so any slow graph can be explained by opening a single trace. Locally everything flows to the Aspire dashboard; in production an OpenTelemetry Collector forwards to Grafana Cloud.

### Trace design

| Span name | Kind | Key attributes |
| --- | --- | --- |
| `HTTP POST /api/v1/graphs/{id}/songs` | Server (automatic) | `graph.id`, `recording.mbid` |
| `crawl.enqueue` | Internal | `crawl.kind`, `crawl.target_mbid`, `crawl.deduplicated` |
| `crawl.job` | Consumer, linked to the enqueuing trace through `traceparent` | `crawl.kind`, `crawl.attempt`, `crawl.queue_wait_ms` |
| `ratelimit.acquire` | Internal | `ratelimit.source`, `ratelimit.wait_ms` |
| `musicbrainz.fetch` | Client (HTTP automatic, enriched) | `mb.entity`, `mb.inc`, `http.response.status_code`, `cache.hit` |
| `credits.persist` | Internal | `credits.inserted`, `credits.duplicates` |
| `signalr.broadcast` | Producer | `signalr.event`, `graph.id`, `seq` |
| `recs.compute` | Internal | `graph.songs`, `recs.candidates`, `recs.returned` |

The browser SDK starts traces for searches and song additions and sends `traceparent` on API calls. Errors set span status to error and record the exception.

### Metrics

| Metric | Type | Labels | Used for |
| --- | --- | --- | --- |
| `crawl.queue.depth` | Gauge | `kind`, `status` | Backlog alerting and the About page |
| `crawl.job.duration` | Histogram | `kind`, `outcome` | Job latency |
| `crawl.queue.wait` | Histogram | `kind` | Time spent waiting for the rate gate |
| `external.requests` | Counter | `source`, `status_code` | Rate limit and error tracking |
| `cache.lookups` | Counter | `entity`, `result` (hit, miss, stale) | Cache hit ratio |
| `graph.time_to_first_hub` | Histogram | `cached` (true, false) | The headline user-facing metric |
| `signalr.connections` | UpDownCounter | none | Live users |
| Standard ASP.NET Core, runtime and Npgsql metrics | Various | Automatic | Platform health |

### Logs

Structured logs through `ILogger` with OpenTelemetry export, correlated to traces by trace and span ID. Log at Information for job lifecycle, Warning for retries, Error for exhausted retries. Never log OAuth tokens, email addresses or anonymous graph tokens.

### Service level objectives

| SLO | Target | Alert |
| --- | --- | --- |
| API availability (non-5xx responses) | 99.5% over 30 days | Burn rate above 14x for 1 hour |
| Search latency | 95% under 1 s | p95 above 1 s for 15 minutes |
| Cached graph load | 95% under 300 ms | p95 above 300 ms for 15 minutes |
| Crawl freshness | 99% of jobs done within 10 minutes of enqueue | Oldest pending job older than 10 minutes |
| MusicBrainz 503 rate | Under 1% of requests | Above 1% for 10 minutes |

### Dashboards

1. **Product health:** requests, errors, latency by endpoint, live connections, time to first hub.
2. **Crawler:** queue depth by kind, rate gate wait, external status codes, cache hit ratio, retries.
3. **SLO overview:** error budget remaining per SLO.

A read-only slice of the crawler dashboard is exposed on the About page through `/api/v1/status/crawl`, so reviewers see real telemetry without a Grafana login.

## 12. Frontend

The frontend is a Vite single-page app in TypeScript, organised by feature, with MUI for every piece of chrome and D3 reserved for the visualisations. D3 owns the maths (forces, scales, zoom); React owns the DOM everywhere except inside the graph canvas.

### Folder structure

```text
web/
  src/
    app/            routes, providers, theme, query client
    api/            generated OpenAPI types, fetch client, SignalR connection
    features/
      search/       search box, results list, duplicate collapse
      graph/        GraphCanvas, GraphListView, legend, role filters
      hubs/         Your hubs panel
      person/       person drawer, credited recordings
      recs/         recommendations list, preview player
      about/        architecture, live crawl status
    stores/         Zustand stores (selection, filters, layout)
    telemetry/      OpenTelemetry web setup
    test/           test utilities and MSW handlers
  scripts/          build-time scripts (first-load bundle budget check)
```

Routes in M1: `/` (home; search and graph from M3), `/about` (a lazy route) and a not-found page for every other address. `/g/:slug` for shared graphs arrives with v2.

### State

- **Server state** (graphs, people, recommendations) lives in TanStack Query. SignalR events update the query cache directly with `setQueryData`, so components never subscribe to the socket themselves.
- **UI state** (selected node, active role filters, hover, layout settings) lives in small Zustand stores.
- **Anonymous graphs** store their `id` and `anonToken` in `localStorage`, wrapped in try/catch.

### Networking

- The browser only makes **same-origin** requests: `/api` for the Api and `/otlp` for telemetry. Vite's dev server proxies both in development and Caddy does in production, so there is no CORS configuration (decision 0004).
- The API client is `openapi-fetch`, typed by the generated `paths`, and looks `fetch` up on each call so that tracing installed after first paint still applies.

### MUI theming

- A custom dark-first "studio" theme with a light variant, built from design tokens in `theme.ts`.
- One colour per credit role, each paired with an icon so colour is never the only signal: Producer (tune), Songwriter (edit), Mixing (equalizer), Engineering (settings), Instrument (piano), Vocal (mic). The icon set is `@mui/icons-material`, which has no guitar or mixer-sliders glyph. Role colours are defined per colour scheme and tested for at least 3:1 contrast against both background colours (WCAG 1.4.11); text is tested for at least 4.5:1.
- The backend's `Other` role (unmapped MusicBrainz relationship types) has no colour or icon yet; M3 decides how it is shown, since principle 5 says incomplete data is never hidden.
- Pages that are not needed for the first render are lazy routes, with a loading bar while their code downloads; the app bar has a skip link and labelled landmarks (NFR-A11Y-01).
- Layout: an app bar with search, a full-bleed graph canvas, a collapsible left panel for hubs and filters, and a right drawer for person details. On phones the panels become bottom sheets.

### D3 visualisations

| Component | D3 modules | Behaviour |
| --- | --- | --- |
| `GraphCanvas` | `d3-force`, `d3-zoom`, `d3-scale`, `d3-quadtree` | Force-directed graph drawn on `<canvas>` for performance; songs as squares, people as circles sized by song count; quadtree hit-testing for hover and click |
| `GraphListView` | none | Accessible table version of the same data, keyboard navigable (NFR-A11Y-01) |
| `HubBar` | `d3-scale` | Small bar chart of top hubs in the panel |
| `CareerTimeline` (v3) | `d3-scale`, `d3-axis`, `d3-time` | Credits per year for a person |
| `StudioMap` (v3) | `d3-geo` | Recording locations on a world map |
| `FamilyTree` (v3) | `d3-hierarchy` | Covers, samples and remixes |

Graph rules:

- New nodes enter near their connected song and fade in over 300 ms, so streaming feels alive rather than jumpy.
- The simulation reheats gently on additions (`alpha` 0.3) and stops when it settles, saving battery.
- Above 300 people, labels show only for hubs and the hovered node.
- The layout runs in a Web Worker when the graph exceeds 500 nodes (NFR-PERF-03).

### Performance budgets

- JavaScript under 250 KB gzipped on first load; D3 visualisations for v3 load lazily. "First load" means the scripts `index.html` loads or preloads. Lazy route chunks and the OpenTelemetry web SDK, which loads after first paint, are reported separately and do not count (decision 0002). CI enforces the 250 KB limit on first-load scripts and prints the full table on each run.
- Measured at the end of M1 (gzip, as reported by the CI script): first load about 150 KB, About route about 10 KB, OpenTelemetry SDK about 23 KB.
- Lighthouse performance score at least 90 on the home page, checked in CI.

## 13. Testing, CI/CD and deployment

Every acceptance criterion in section 3 maps to at least one automated test, and no test ever calls the real MusicBrainz API: a WireMock.Net fake serves recorded responses instead.

### Test layers

| Layer | Tools | What it covers | Runs |
| --- | --- | --- | --- |
| Backend unit | xUnit, FluentAssertions | Role mapping, recommendation scoring, path search, dedup logic | Every push |
| Backend integration | xUnit, Testcontainers (PostgreSQL, Redis), WireMock.Net | Endpoints, EF Core queries, crawl worker, rate gate, retries | Every push |
| Contract | OpenAPI diff | Breaking API changes fail the build unless the version changes | Every pull request |
| Frontend unit | Vitest, React Testing Library, MSW | Components, stores, SignalR cache updates | Every push |
| End to end | Playwright against the Aspire stack | US-01 to US-03 and US-08 happy paths, accessibility checks with axe | Every pull request |
| Load | k6 | Search and cached graph endpoints against NFR-PERF targets | Nightly and before release |

Test naming carries the requirement ID, for example `FR_GRAPH_03_credits_from_work_are_attached_to_recording`, so a search for an ID finds its tests.

How the layers run in practice (M1):

- Backend tests use **xUnit v3**, which needs `global.json` to opt in to the Microsoft Testing Platform (`"test": { "runner": "Microsoft.Testing.Platform" }`) on the .NET 10 SDK. `dotnet test` from the repository root runs every project.
- Integration tests start a real PostgreSQL 18 container with Testcontainers, so **Docker must be running**. One container is shared by each test project (an xUnit assembly fixture) and every test gets its own database.
- Frontend tests use Vitest with MSW: the real client and components run against a fake Api, and any request without a matching handler fails the test.
- Until Domain has logic (M2), backend assertions use xUnit's `Assert`; the assertion library is an open question (section 15).

### Repository layout

```text
nodeable/
  CLAUDE.md                        Working rules for AI coding assistants; points to the spec
  README.md                        Project overview, how to run, links to spec and guides
  global.json                      Pins the .NET SDK and selects the Microsoft Testing Platform
  Directory.Build.props            Shared compiler settings: nullable, warnings as errors, NuGet audit
  Directory.Packages.props         Central package management: every NuGet version in one file
  Nodeable.slnx                    Solution file
  .editorconfig                    Code style and naming rules, enforced at build time
  .config/dotnet-tools.json        Local tools (dotnet-ef)
  .github/
    workflows/                     CI pipeline and learning guide release workflow
    dependabot.yml                 Weekly dependency updates
  src/
    Nodeable.AppHost/              Aspire orchestration for local dev
    Nodeable.ServiceDefaults/      OpenTelemetry, health checks, resilience defaults
    Nodeable.Api/                  Minimal API endpoints, SignalR hub
    Nodeable.Worker/               Crawl queue consumer, Hangfire jobs
    Nodeable.Domain/               Entities, role mapping, scoring, path search
    Nodeable.Infrastructure/       EF Core, MusicBrainz, Discogs, Deezer clients, rate gate
  web/                             React app
  tests/                           Backend unit and integration tests (one project per source project)
    Shared/                        Source files compiled into several test projects (PostgreSQL fixture)
  e2e/                             Playwright tests
  load/                            k6 scripts
  infra/                           Terraform, Docker Compose, Caddyfile, Collector config
  docs/
    spec/nodeable-spec.md          This specification (source of truth)
    spec/decisions/                Architecture decision records
    learning/                      Learning guides (Markdown) and pdf/ output
  tools/learning/                  collect-anchors and build scripts
```

### CI pipeline (GitHub Actions)

1. Restore, build and lint backend and frontend in parallel.
2. Run unit and integration tests; publish coverage and fail under 80% on `Domain`.
3. Generate the OpenAPI document and diff it against `main`.
4. Build Docker images for Api, Worker and Web; scan them for vulnerabilities.
5. Run Playwright end-to-end tests against the composed stack.
6. On `main`, push images to GitHub Container Registry and deploy.

Implemented in M1 (`.github/workflows/ci.yml`, four parallel jobs): **backend** (restore, Release build with warnings as errors, `dotnet format --verify-no-changes`, tests, NuGet vulnerability check), **web** (`npm ci`, typecheck, ESLint, tests, build, the 250 KB first-load budget, `npm audit`), **api-contract** (regenerate `web/src/api/schema.d.ts` and fail on any difference) and **learning-tools** (anchor script tests and `--check`). Not yet in place: the 80% coverage gate on `Domain` (it has no logic until M2), the OpenAPI diff against `main`, image build and scanning, Playwright, and the deploy step (M4).

### Deployment

- **Local:** `dotnet run --project src/Nodeable.AppHost` starts PostgreSQL, Redis, Api, Worker, the Vite dev server and the Aspire dashboard together. Docker must be running. The dashboard is at `http://localhost:15180`; Aspire assigns the web app's port on every run and shows it in the dashboard. Running `npm run dev` on its own serves the web app on port 5173 and proxies `/api` to the Api's launch-profile port 5029.
- **Production:** one small VPS provisioned by Terraform, running Docker Compose with Caddy for HTTPS, Api, Worker, Web (static files served by Caddy), PostgreSQL, Redis and the OpenTelemetry Collector.
- **Releases:** images tagged by commit SHA; deploys pull new images and restart with health checks; EF Core migrations run as a separate one-off step before the Api starts.
- **Backups:** nightly `pg_dump` to object storage, keeping 14 days; a restore drill runs monthly.
- **Secrets:** GitHub Actions secrets for CI, an environment file with restricted permissions on the server.

## 14. Roadmap and tasks

The MVP takes about 12 weeks of part-time work across five milestones, and nothing from v2 starts until the MVP is public. Durations assume roughly 10 to 12 hours a week alongside a full-time job.

&#91;embedded content: roadmap · 5 MVP milestones, 2 gates\]

Each milestone ends with a demo, a spec review and its learning guide PDF (section 16): update this document with anything learned before starting the next.

### M0 Learning spike (2 weeks)

- [x] Complete a C# fundamentals course focused on records, LINQ, async and nullable types
- [x] Build a throwaway console app that searches MusicBrainz and prints credits for one song
- [x] Create a starter Aspire app and explore traces in the Aspire dashboard
- [x] Convert one small existing React component to TypeScript

### M1 Foundations (2 weeks)

- [x] Create the repository layout from section 13 with AppHost and ServiceDefaults
- [x] Add PostgreSQL and Redis to the AppHost; first EF Core migration with all MVP tables (section 8)
- [x] Scaffold the Vite + TypeScript + MUI app with the studio theme and routing
- [x] Generate OpenAPI types into `web/src/api`
- [ ] GitHub Actions: build, test, lint for both halves (workflow added; tick after its first green run on GitHub)
- [x] OpenTelemetry wired in Api, Worker and the browser; one trace visible end to end

### M2 Ingestion (3 weeks)

- [ ] MusicBrainz client with User-Agent and typed responses (FR-SEARCH-01)
- [ ] Redis token-bucket rate gate shared by all instances (NFR-RATE-01)
- [ ] Resilience pipeline for 503 and 429 with backoff and jitter (NFR-RATE-03)
- [ ] `crawl_jobs` queue with `SKIP LOCKED` claiming and trace context propagation (NFR-REL-01)
- [ ] Role mapping and credit upserts for recording, work and release levels (FR-GRAPH-03)
- [ ] Integration tests with Testcontainers and WireMock.Net recordings

### M3 Graph UI (3 weeks)

- [ ] Search box with duplicate collapsing (FR-SEARCH-01, FR-SEARCH-02)
- [ ] Graph endpoints and SignalR hub with `seq` ordering (FR-GRAPH-01, FR-GRAPH-02)
- [ ] D3 canvas graph with zoom, hover, click and enter animations (FR-HUB-01)
- [ ] Accessible list view of the same graph (NFR-A11Y-01)
- [ ] Your hubs panel and role filters (FR-HUB-02, FR-HUB-03)
- [ ] Credits incomplete badge (FR-GRAPH-04)

### M4 Discovery and launch (2 weeks)

- [ ] Person drawer with credited recordings (FR-PERSON-01)
- [ ] Recommendation scoring with reasons (FR-REC-01, FR-REC-02)
- [ ] Deezer previews by ISRC (FR-PREVIEW-01)
- [ ] About page with architecture and live crawl status (FR-ABOUT-01)
- [ ] Grafana dashboards and SLO alerts (section 11)
- [ ] Terraform VPS, Caddy, Docker Compose deploy; seed the demo cache
- [ ] Playwright suite green; k6 confirms NFR-PERF-01 and 02

### v2 and v3

Break v2 and v3 into tasks at the MVP retrospective, using the requirement tables in section 4 as the backlog.

## 15. Risks, open questions and decisions

The biggest risk is data, not code: MusicBrainz credit coverage is uneven and its rate limit caps how fast new songs resolve.

### Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Sparse credits for less mainstream songs | Graphs with few hubs feel empty | "Credits incomplete" badges, Discogs enrichment (v2), seed the cache with well-credited albums for the demo |
| MusicBrainz rate limit slows first-time graphs | 15 uncached songs take about a minute | Streaming results, a warm cache, priority for the active user's jobs, self-hosted mirror later |
| Being blocked by MusicBrainz | Ingestion stops entirely | Global rate gate across instances, descriptive User-Agent, randomised background schedules, alert on 503 rate |
| Spotify API restrictions tighten further | Export breaks | Export never depends on Spotify; M3U and CSV always work |
| Deezer preview availability changes | No in-app audio | Previews are optional; fall back to open-in-service links |
| Scope creep from v3 features | MVP never ships | Strict phase gates in section 14; v3 work starts only after MVP is public |
| Learning curve of C#, .NET and Aspire alongside product work | Slower early milestones | Milestone 0 is a learning spike with a throwaway prototype |

### Open questions

- [ ] Which domain name for Nodeable?
- [ ] VPS or Azure Container Apps for production? A VPS meets the USD 25 budget; Azure looks stronger on a .NET-focused CV.
- [ ] Should anonymous graphs expire after 90 days of inactivity?
- [ ] Is Google sign-in enough for v2, or add GitHub for the developer audience?
- [ ] Which 5 to 10 albums should seed the demo cache?

Raised while building M1, to be decided in the milestone that needs them:

- [ ] **Partial dates (M2).** MusicBrainz dates can be a year (`1995`) or a year and month. `recordings.first_release_date` and `releases.date` are `date` columns, so a year-only value would become 1 January and lose the fact that it was a guess (principle 5). Options: a precision column, or storing the year separately.
- [ ] **Which jobs the Api queues (M2).** Section 7 step 3 queues four jobs when a song is added, but the work and release IDs are only known after the recording fetch. Options: the Api queues only the recording job and the Worker queues the rest, or the Api queues placeholder jobs.
- [ ] **How the `Other` role looks (M3).** The database keeps unmapped MusicBrainz relationship types as role `other`; the UI has six role colours and icons and none for `other`.
- [ ] **Persistent local database (M3).** Local PostgreSQL is ephemeral (decision 0003). A graph that survives restarts needs a data volume and a pinned password.
- [ ] **Assertion library (M2).** FluentAssertions 8 and later is commercially licensed; AwesomeAssertions is a free fork with the same syntax. Section 13 names FluentAssertions. Decide when the first role-mapping tests are written.
- [ ] **ESLint 10 and TypeScript 7.** Revisit when `eslint-plugin-jsx-a11y` declares ESLint 10 support and typescript-eslint supports TypeScript 6.1 or later (decision 0001).

### Decision log

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-10-08 | MusicBrainz is the primary credit source | Free, open licence, rich relationship data |
| 2026-10-08 | PostgreSQL over a graph database for MVP | Graph sizes are small; recursive CTEs and in-memory BFS suffice; revisit with Apache AGE past about 1 million credits |
| 2026-10-08 | Durable crawl queue in PostgreSQL rather than a message broker | One less moving part; `SKIP LOCKED` handles concurrency at this scale |
| 2026-10-08 | Canvas rendering for the graph | SVG struggles beyond a few hundred animated nodes |
| 2026-10-08 | Export through M3U and CSV first, Spotify only for allowlisted accounts | Spotify Development Mode restrictions from February 2026 |
| 2026-10-08 | Deezer for previews | Public API with 30-second previews and no key required |
| 2026-10-09 | The app is named Nodeable | Replaces the working title Credits Graph |
| 2026-10-09 | Lint the web app with ESLint 9 and type-checked typescript-eslint plus jsx-a11y, not oxlint ([0001](decisions/0001-eslint-with-typescript-eslint.md)) | Type-aware rules teach TypeScript and catch real bugs; ESLint is the industry standard |
| 2026-10-09 | Keep the 250 KB first-load budget; split code by route and load the OpenTelemetry web SDK after first paint ([0002](decisions/0002-bundle-budget-and-loading-strategy.md)) | Keeps the constraint real; measure at the end of M1 and propose a spec change with numbers if it is exceeded |
| 2026-10-11 | Apply EF Core migrations at Api startup in Development only; production runs a separate step ([0003](decisions/0003-migrations-at-startup-in-development.md)) | One command starts the stack without a migration-service project; production keeps the safer separate step |
| 2026-10-11 | The browser makes same-origin requests only: `/api` and `/otlp` are proxied by Vite and, in production, Caddy ([0004](decisions/0004-same-origin-api-and-telemetry.md)) | No CORS rules, `traceparent` travels same-origin, and the browser never learns where telemetry goes |
| 2026-10-11 | The OpenAPI document is written at build time, generated types are committed and checked in CI, and JSON numbers are strict ([0005](decisions/0005-generated-api-contract.md)) | Principle 6 without needing a running server; the default number handling produced `number \| string` |
| 2026-10-11 | Enum columns are lower-case text with CHECK constraints ([0006](decisions/0006-enums-stored-as-lowercase-text.md)) | Readable rows, the section 8 SQL compares against lower-case literals, and the database rejects unknown values |
| 2026-10-11 | Anonymous graph tokens are stored as a SHA-256 hash ([0007](decisions/0007-anonymous-graph-tokens-are-hashed.md)) | The token is a bearer credential; a database leak must not expose usable tokens |
| 2026-10-11 | `credits.detail` is never null; foreign keys are declared where the target is a single table; no separate `person_mbid` index on `credits`; `previews` is keyed by (`recording_mbid`, `provider`); `crawl_jobs.kind` gains `artist` | PostgreSQL treats NULLs as distinct in unique indexes, so a NULL detail would defeat idempotent re-crawls; the unique index already serves `person_mbid` lookups; section 10's person fetch needs its own kind |
| 2026-10-11 | Instrument and mixing roles use the piano and equalizer icons | `@mui/icons-material` has no guitar or mixer-sliders glyph; the icons remain distinct from the other four |

## 16. Learning guides

After every milestone and every major v2 or v3 feature, the project produces a PDF learning guide that maps what was built to exactly where it lives in the code and explains the new concepts it uses. A feature is not done until its guide exists. The guides serve two purposes: learning C#, .NET, TypeScript and the new tooling properly rather than copying code, and preparing to explain every part of the project in interviews.

### Definition of done (added to every milestone)

- [ ] Code merged, tests green, spec updated
- [ ] `LEARN` anchors added at every key point in the code (see below)
- [ ] Learning guide written in `docs/learning/LG-xx-<name>.md`
- [ ] PDF generated and attached to the milestone's GitHub release
- [ ] Exercises in the guide attempted without looking at the solution

### What each guide contains

| Section | Purpose |
| --- | --- |
| 1. What was built | The requirement IDs delivered (for example FR-GRAPH-02) and a one-paragraph summary |
| 2. Architecture slice | A diagram of only the components this feature touches, and how a request flows through them |
| 3. Code map | A table of every important file and line range, what it does and which concept it demonstrates, each linked to the exact commit |
| 4. Annotated walkthrough | Short excerpts of the key code with line-by-line explanations of why it is written that way |
| 5. New concepts from a JavaScript point of view | Side-by-side comparisons, for example C# `async`/`await` and `Task` versus JavaScript Promises, LINQ versus array methods, dependency injection versus Node module imports |
| 6. Run it and break it | How to run the feature locally, which tests cover it, and one deliberate change to make and observe failing |
| 7. Read the trace | A screenshot of the feature's trace in the Aspire dashboard, with each span explained |
| 8. Decisions and trade-offs | Alternatives considered and why they lost, linked to the decision log |
| 9. Interview talking points | Three to five ways to explain this feature, from a 30-second summary to a deep dive |
| 10. Exercises | Two or three small extensions to build without help, with hints |
| 11. Further reading | Official docs for each tool used |

### Code anchors

Key places in the code carry a comment in a fixed format, so guides are built from the code rather than from memory:

```csharp
// LEARN: LG-02 rate-gate | Redis Lua script makes the token check and decrement atomic across instances
```

```ts
// LEARN: LG-03 signalr-cache | SignalR events write straight into the TanStack Query cache
```

The script `tools/learning/collect-anchors` scans the repository for `LEARN:` comments and outputs the code map table (section 3) with file paths, line numbers and permalinks pinned to the release commit, so links never go stale.

### How the PDF is produced

1. At the end of a milestone, run `tools/learning/collect-anchors LG-02` to generate the code map.
2. Write or draft the guide in Markdown from the template at `docs/learning/_template.md`. An AI coding assistant can draft sections 1 to 4 from the anchors and the diff; sections 5 to 10 are written or reviewed by hand, since writing them is where the learning happens.
3. Run `tools/learning/build LG-02`, which uses Pandoc with syntax highlighting to render `docs/learning/pdf/LG-02-ingestion.pdf`.
4. A GitHub Actions workflow rebuilds every guide when a release is tagged and attaches the PDFs to the release, so the published guides always match the published code.

### Guide plan

| Guide | After | Key concepts covered |
| --- | --- | --- |
| LG-01 Foundations | M1 | Aspire AppHost and service defaults, EF Core entities and migrations, Vite + TypeScript + MUI theme setup, generating API types from OpenAPI, OpenTelemetry wiring across browser and server |
| LG-02 Ingestion | M2 | Typed `HttpClient`, resilience pipelines, Redis token bucket with Lua, durable queue with `FOR UPDATE SKIP LOCKED`, trace context across background jobs, relationship-to-role mapping |
| LG-03 Graph UI | M3 | SignalR hubs and groups, TanStack Query cache updates, Zustand stores, D3 force simulation on canvas, quadtree hit testing, accessible list view |
| LG-04 Discovery and launch | M4 | Recommendation SQL and scoring, Deezer integration, Grafana dashboards and SLO alerts, Terraform and Caddy deployment, Playwright and k6 |
| LG-05 Accounts and saves | v2 | ASP.NET Core Identity, Google sign-in, migrating anonymous data to accounts |
| LG-06 Six degrees | v2 | Bidirectional breadth-first search in C#, adjacency lists, recursive CTEs |
| LG-07 Producer radar | v2 | Hangfire recurring jobs, randomised scheduling, notifications |
| LG-08 Sharing | v2 | Public read-only routes, server-rendered Open Graph images |

### Acceptance criteria

- Given a milestone is tagged, then its guide PDF is attached to the GitHub release within the same workflow run.
- Given a guide's code map, then every link opens the right file and lines at the release commit.
- Given any `LEARN` anchor in the code, then it appears in exactly one guide.

## Sources

- [.NET support policy](https://dotnet.microsoft.com/en-US/platform/support/policy)
- [Introducing Material UI and MUI X v9](https://mui.com/blog/introducing-mui-v9/)
- [Aspire dashboard glossary](https://aspire.dev/hub/glossary/aspire-dashboard/)
- [MusicBrainz API rate limiting](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting)
- [Discogs API documentation](https://www.discogs.com/developers)
- [Spotify: update on developer access, February 2026](https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security)
