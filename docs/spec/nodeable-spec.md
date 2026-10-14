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
| FR-HUB-01 | A person is sized by the number of graph songs they are credited on (constellation), and a person on two or more songs is marked as a connector (orbit) | US-02 |
| FR-HUB-02 | Connector cards list people credited on 2 or more songs, sorted by count (M3's "Your hubs" panel, redesigned in M3R) | US-02 |
| FR-HUB-03 | Role filters toggle producer, songwriter, mixing, engineering, instrument and vocal credits; one chip turns that role off or on (it does not show only that role), and while any role is off a bar under the headline names what is shown or hidden, says the counts, connectors and cards follow it, and offers "Show all roles" | US-02 |
| FR-PERSON-01 | Clicking a person opens a drawer with role summary, active years and credited recordings | US-03 |
| FR-REC-01 | Recommendations rank recordings by the number of graph hubs credited on them, excluding songs already in the graph | US-03 |
| FR-REC-02 | Each recommendation shows a plain-language reason | US-03 |
| FR-PREVIEW-01 | Recordings play a 30-second preview when one is available from Deezer | US-03 |
| FR-WAVE-01 | The preview player shows the recording's waveform with a playhead, drawn with D3 from peaks computed once before the first frame; clicking or keying along it seeks; the record of the playing song spins while it plays, and with reduced motion it does not (the playhead and the time still move: they are the position, not decoration). Where the audio cannot be decoded the player works without the waveform (decision 0022). | US-03 |
| FR-ABOUT-01 | An About page shows the architecture, a live crawl status panel from real telemetry, and links to the repository and spec | US-08 |

### M3R UI refresh (approved 2026-10-13, decision 0020)

The design is the prototype in `docs/design/nodeable-ui-prototype.html`. These requirements add to the MVP table; FR-SEARCH-01/02, FR-GRAPH-01..04 and FR-HUB-01..03 still apply to the new views.

| ID | Requirement | Story |
| --- | --- | --- |
| FR-VIEW-01 | An orbit view centres one song or person: a radial tree of depth 2 with role arcs; choosing any node re-roots it, with breadcrumbs and animated polar transitions | US-01, US-02 |
| FR-VIEW-02 | A constellation view shows the whole graph as a force layout with zoom and drag; choosing a node opens it in the orbit; an Orbit / Constellation toggle switches between them | US-02 |
| FR-NOTES-01 | Liner notes list each song's credits grouped by role with its credits status, highlight credits as they arrive, and offer removing the song | US-01 |
| FR-LAND-01 | A landing page explains the product and holds the search; it offers the person's existing graph | US-01 |
| FR-GRAPH-05 | A song or person already in the graph can be found by name and becomes the orbit's centre | US-02 |
| FR-ART-01 | Songs show their cover: Cover Art Archive by release, then by release group, then the Deezer album cover, then a generated sleeve; never through the MusicBrainz rate gate | US-01 |
| FR-GRAPH-06 | Removing a song from its liner-notes card or the Text view can be undone for six seconds: the song leaves the views with an exit animation, the people credited only on it leave with it, and the request to the Api is sent when the time is up | US-01 |
| FR-VIEW-04 | The orbit is centred on the whole graph by default: a hub labelled with the number of songs, every song on the first ring with its cover and their people on the second, so songs that share nobody are all in view; choosing a song or a person re-roots the orbit, and the first breadcrumb, "Your graph", always goes back to the whole graph; while a song or a person is the centre a chip on the stage says how many songs are not connected to it ("2 songs not connected · Your graph") and goes back to the whole graph | US-01, US-02 |
| FR-VIEW-03 | A person can be hidden from the views for the browser session: they leave the orbit, the constellation, the connector cards, the Text view and the counts; nothing is deleted or sent to the server; a "n hidden · show" control brings them back | US-02 |

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
| FR-CREDIT-USER-01 | A signed-in person adds credits (person, role, detail) to a song in their own graph. They are stored apart from MusicBrainz's credits, with source `user`, the author's account id only, a status and timestamps; they are labelled "Added by you", are private to the author until approved, are never mixed into MusicBrainz's rows, and are kept when MusicBrainz later adds credits. The "Add credits on MusicBrainz" link stays | US-01, US-04 |
| FR-CREDIT-REVIEW-01 | "Submit for review" sends a credit to an approval queue for the `admin` role. The reviewer approves, or rejects with a reason; every step is kept in an audit trail. An approved credit is shown to everyone labelled "Community". When MusicBrainz later has the same credit, ours is marked superseded. Submitting means accepting CC0 terms. Each person has a daily submission limit. An approved credit offers a link to submit it to MusicBrainz | US-01, US-04 |

### v3

| ID | Requirement | Story |
| --- | --- | --- |
| FR-HEROES-01 | "Unsung heroes" ranks session musicians and engineers on the user's songs whom the user has never searched | US-02 |
| FR-TREE-01 | A song family tree shows covers, samples and remixes from MusicBrainz relationships | US-03 |
| FR-MAP-01 | A studio map plots where the user's songs were recorded | US-02 |
| FR-TIMELINE-01 | A person's career timeline shows credits by year, with collaborators and roles | US-03 |
| FR-COMPARE-01 | Two users' graphs can be overlaid to show shared hubs | US-07 |
| FR-QUIZ-01 | A "guess the producer" quiz built from cached credits and previews | US-03 |
| FR-CREDIT-VOTE-01 | Signed-in people vote on community credits, and trust levels (5 or more approved credits and none rejected in the last 90 days) let a person skip the queue. Started only when there are enough active signed-in users for votes to mean something (100 active signed-in users in 30 days; the number may be revisited at the v2 retrospective) | US-01, US-04 |
| FR-WAVE-02 | A three-band (low, mid, high) coloured waveform, an estimated tempo (BPM) and, as a stretch, the musical key, computed in the Worker from the preview and cached. With reduced motion the waveform is static: drawn at once, with no draw-in and no motion that follows the sound | US-03 |

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
| NFR-CACHE-01 | Caching | Every recording added to a graph is persisted with its releases, works, people and credits and is reused, never fetched twice (until NFR-REL-03's refresh): search reads the stored recordings first, and adding a stored recording with credits makes no MusicBrainz request. This states what M2 and M3 already do (section 10, "Persist, then reuse"); it adds no behaviour |
| NFR-SEC-01 | Security | Secrets are never committed; local development uses user secrets, production uses the host's secret store |
| NFR-SEC-02 | Security | Public endpoints are rate limited per IP: 60 searches per minute, 20 song additions per minute, 60 preview lookups per minute |
| NFR-SEC-03 | Security | OAuth tokens for Spotify are encrypted at rest and never sent to the browser |
| NFR-SEC-04 | Security | Dependencies are scanned on every pull request |
| NFR-SEC-05 | Security | Community credits are written only by their signed-in author and moderated only by the `admin` role, both checked by the Api on every request, never by what the browser sends; there is a per-person daily submission limit (10 a day, a configuration value); `detail` is length-limited and rendered as text, never as markup; review decisions are kept in an append-only audit trail |
| NFR-A11Y-01 | Accessibility | WCAG 2.2 AA; the graph has a keyboard-navigable list view with the same data |
| NFR-A11Y-02 | Accessibility | Colour is never the only carrier of meaning; role colours also use icons or patterns (the legend and filter chips carry an icon and the name; arcs and notes carry the role's name) |
| NFR-MOTION-01 | Accessibility | List and graph animations (staggered rise, match bars, add pop, version expand, FLIP reorder, count-up, new-credit highlight, streaming bloom, polar transitions and, from M4, the record's spin while a preview plays and the waveform's draw-in) respect `prefers-reduced-motion`, including a change made while the page is open; CSS animations change only `transform` and `opacity` |
| NFR-OBS-01 | Observability | Every request and job is traced end to end, from browser click to external API call |
| NFR-PRIV-01 | Privacy | No tracking cookies; analytics are first-party and anonymous |
| NFR-PRIV-02 | Privacy | A privacy notice is published before accounts exist (FR-AUTH-01) and is updated by FR-CREDIT-USER-01. It says what is stored about a person (an email address and account id; for a community credit the account id, the credit and timestamps, and the accepted CC0 terms' version and time), that a credit's author is never shown, that a CC0 submission is public and cannot be withdrawn once approved, how long data is kept, and what deleting the account does (private and rejected credits are deleted, submitted ones withdrawn, approved ones kept without the author id). Legal review of the text is the developer's to arrange |
| NFR-COST-01 | Cost | The production stack runs for under USD 25 per month at portfolio traffic |
| NFR-LIC-01 | Licensing | Nodeable uses only MusicBrainz's core data (CC0, section 10) and community credits submitted under CC0; no supplementary (CC BY-NC-SA) data is stored; every credit shown carries its origin, so MusicBrainz's data and the community's are never presented as one thing |

## 6. Tech stack and learning goals

The stack keeps React, MUI and D3 at the centre and deliberately adds tools outside a JavaScript and Node.js comfort zone: C# and .NET 10, TypeScript, Aspire, the Grafana observability stack, Terraform and k6. Items marked **New** are the main learning targets.

### Frontend

| Tool | Role in the app | What it teaches |
| --- | --- | --- |
| React 19 + Vite | App shell, routing, components | Modern React patterns: Suspense, transitions |
| TypeScript (**New**) | Typed components and API client | Static typing, generics, discriminated unions |
| Material UI v9 | Inputs, buttons, dialogs and sheets, restyled through the theme | Design tokens, dark theme, accessible components |
| D3 v7 (modules) | Radial tree, force graph, zoom, drag, timelines, maps | Hierarchy and radial layout, polar transitions, force simulation, scales, canvas rendering |
| `@fontsource-variable` | Archivo (width axis) and JetBrains Mono, self-hosted | Variable fonts, `font-display`, preloading, font budgets |
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

Versions M1 was built and tested against: .NET SDK 10.0 (pinned in `global.json`), Aspire 13.6, EF Core 10.0, Npgsql provider 10.0, PostgreSQL 18 and Redis 8.6 (Aspire's defaults), React 19.2, Vite 8, TypeScript 6.0, Material UI 9.5, React Router 8, TanStack Query 5, ESLint 9 (moved to ESLint 10 with `eslint-plugin-jsx-a11y-x` at the start of M2, decision 0014). TypeScript stays below 6.1 until typescript-eslint supports more (decision 0013).

## 7. System architecture

The system is two .NET processes, an API and a Worker, sharing PostgreSQL and Redis. The Worker makes every background fetch, and every MusicBrainz request, from either process, passes through one shared Redis rate gate, so the limit holds for the whole system. The API queues work and returns immediately, with one exception: a search must answer in the same request, so the API asks MusicBrainz itself, through that same gate, with a short wait cap (decision 0018).

&#91;embedded content: system architecture · 8 components\]

Solid arrows carry requests and data; dashed arrows carry telemetry to the Collector, which forwards it to Grafana Cloud in production and the Aspire dashboard locally.

### Flow: adding a song

1. The browser sends `POST /graphs/{id}/songs` with the graph token and a `traceparent` header. The body is the recording's MBID only.
2. The API checks the token. It then looks the recording up in PostgreSQL. A recording it has never seen is first confirmed with MusicBrainz (title and artist only, through the shared gate with the interactive profile of decision 0018), so a made-up MBID never becomes a row of the shared cache (decision 0019).
3. Cached credits (status other than `none`) are sent to the graph's browsers by the API itself, as the events of step 6, and the answer is 200. Otherwise the API upserts the `recordings` row, inserts one `crawl_jobs` row for the recording fetch with the trace context stored on it, and returns 202 with the song node (decision 0009).
4. The Worker claims jobs with `FOR UPDATE SKIP LOCKED`, highest priority first, and waits for a token from the Redis rate gate.
5. The Worker fetches from MusicBrainz, maps relationships to roles, and upserts `people` and `credits`. From the recording response it queues the follow-up jobs itself: a `work` job per linked work, a `preview` job when an ISRC is known, and a `release` job only when no producer credit was found. Each carries the same trace context and priority.
6. When a job ends, the Worker finds the recordings it concerned and the graphs that hold them, and publishes `CreditsResolved`, `SongStatusChanged`, `CrawlProgress` and `HubsUpdated` (or `CrawlFailed`) through SignalR, using the Redis backplane, to every client in each graph's group. The Worker has no hub of its own: it sends to the one the API hosts.
7. The browser merges each event into the TanStack Query cache, and new nodes animate into the graph.

### How the queue works (implemented in M2)

- **One table, no broker.** `crawl_jobs` is the queue (PostgreSQL), so a job survives the restart of any service (NFR-REL-01).
- **Adding a job.** `INSERT ... ON CONFLICT DO NOTHING` against the partial unique index, so the same fetch is never queued twice while it is pending or running. If a person asks for something a background refresh already queued, the waiting job takes the higher priority; it is never lowered. The current trace context is stored in `traceparent`.
- **Claiming a job.** One statement: `UPDATE ... WHERE id = (SELECT ... WHERE status = 'pending' AND run_after <= now() ORDER BY priority DESC, run_after ASC LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`. A worker skips a row another worker is claiming instead of waiting, so any number of workers can pull from the table. Each claim counts an attempt, and every time comparison uses the database's clock, so machines with skewed clocks agree.
- **Finishing.** Done, or failed with the error kept in `last_error`. Completing and failing are guarded by `locked_by`, so a worker that was too slow cannot overwrite the claim of the worker that took its job over.
- **Retries of a whole job (not the HTTP retries of NFR-RATE-03).** 5 attempts, waiting 30 seconds before the second and doubling each time (capped at 15 minutes, spread by up to 20% either way). A kind with no handler fails at once.
- **Shutdown and crashes.** A worker that is stopping hands its job back without counting the attempt. A job still `running` after 10 minutes belongs to a worker that died: every worker looks for these each minute and puts them back, or fails them when they have used their attempts, so a job that keeps killing its worker cannot loop for ever.
- **Polling is not traced.** A worker asks every second and most polls find nothing, so claiming and stale recovery run with instrumentation suppressed; the `crawl.job` span records what a claim found. An idle Worker produces no traces.
- **Priorities.** Interactive 100, scheduled 10. A worker processes one job at a time; run more Worker instances for more throughput, and the rate gate keeps them within the MusicBrainz limit.

### Flow: scheduled work

- Hangfire runs producer radar checks and stale-cache refreshes, spreading individual checks at random times across the day as MusicBrainz asks.
- Scheduled jobs use the same `crawl_jobs` queue at a lower priority, so interactive users always go first.

## 8. Data model

All music data is keyed by MusicBrainz IDs (MBIDs), and every credit is stored once in a single `credits` table regardless of whether it came from a recording, a work or a release. A view flattens those three levels into "who is credited on this recording", which every graph feature reads.

### Tables

| Table | Purpose | Key columns |
| --- | --- | --- |
| `recordings` | A specific performance of a song | `mbid` PK, `title`, `artist_credit`, `first_release_date`, `first_release_date_precision` (year, month, day), `length_ms`, `isrcs` (text array, empty by default; M4, decision 0025), `credits_status` (complete, partial, none), `fetched_at` |
| `works` | The underlying composition | `mbid` PK, `title`, `fetched_at` |
| `releases` | Albums and singles | `mbid` PK, `title`, `date`, `date_precision` (year, month, day), `status` (nullable), `release_group_mbid` (nullable), `release_group_type` (nullable), `release_group_secondary_types` (text array, empty by default), `fetched_at` |
| `recording_works` | Recording to work links | (`recording_mbid`, `work_mbid`) PK |
| `recording_releases` | Recording to release links | (`recording_mbid`, `release_mbid`) PK |
| `people` | Artists, producers, engineers, musicians | `mbid` PK, `name`, `sort_name`, `type`, `disambiguation`, `fetched_at` |
| `credits` | One person, one role, on one subject | `id` PK, `person_mbid`, `subject_type` (recording, work, release), `subject_mbid`, `role`, `detail` (never null, empty string when there is none), `source` (musicbrainz, discogs) |
| `previews` | A recording's track at a preview provider; only IDs are stored, never the expiring preview URL. A row exists only when the provider had a preview | (`recording_mbid`, `provider`) PK, `provider_track_id`, `cover_md5` (nullable; the provider's album image ID, M4), `fetched_at` |
| `graphs` | A user's set of songs | `id` PK, `owner_id` (nullable), `anon_token_hash` (SHA-256 of the token, decision 0007), `name`, `is_public`, `share_slug` |
| `graph_songs` | Songs in a graph | (`graph_id`, `recording_mbid`) PK, `added_at` |
| `crawl_jobs` | Durable queue of external fetches | `id` PK, `kind` (recording, work, release, preview, artist), `target_mbid`, `priority`, `status` (pending, running, done, failed), `attempts`, `run_after`, `locked_by`, `locked_at`, `last_error`, `traceparent` |
| `saved_recordings` | Discovery list (v2) | (`user_id`, `recording_mbid`) PK, `saved_at`, `reason` |
| `follows` | Producer radar (v2) | (`user_id`, `person_mbid`) PK, `last_checked_at` |
| `notifications` | In-app alerts (v2) | `id` PK, `user_id`, `kind`, `payload` jsonb, `read_at` |

User accounts use the standard ASP.NET Core Identity tables. The `traceparent` column on `crawl_jobs` stores the W3C trace context of the request that queued the job, so a background fetch appears in the same trace as the click that caused it.

### Tables for community credits and previews (v2 and v3; approved 2026-10-14)

| Table | Purpose | Key columns |
| --- | --- | --- |
| `user_credits` (v2) | A credit a signed-in person added, apart from MusicBrainz's `credits` (decision 0021) | `id` PK, `author_id` (the account's id, nullable once an approved credit's author is removed; no name, no email), `recording_mbid` (FK to `recordings`), `person_mbid` (FK to `people`), `role` (the same values as `credits.role`), `detail` (never null), `source` (`user`; the one value, so a later origin is a CHECK change), `status` (private, submitted, approved, rejected, superseded), `created_at`, `updated_at`, `submitted_at`, `reviewed_at`, `reviewed_by` (account id of the admin), `review_reason`, `terms_version` and `terms_accepted_at` (set on submission) |
| `credit_review_events` (v2) | Append-only audit trail of a user credit's life | `id` PK, `user_credit_id` (FK, no cascade: an erased credit leaves its history), `at`, `actor_id`, `action` (created, submitted, withdrawn, approved, rejected, superseded, deleted), `reason`, `from_status`, `to_status` |
| `credit_votes` (v3) | A person's vote on an approved community credit | (`user_credit_id`, `voter_id`) PK, `vote` (confirm, dispute), `voted_at` |
| `preview_analysis` (v3) | What the Worker worked out from a preview (FR-WAVE-02); never the audio | (`recording_mbid`, `provider`) PK, `peaks_low`, `peaks_mid`, `peaks_high` (small integer arrays of a fixed length), `duration_ms`, `bpm` (nullable), `bpm_confidence` (nullable), `musical_key` (nullable), `algorithm_version`, `computed_at` |

- **Constraints.** `user_credits` is unique on (`author_id`, `recording_mbid`, `person_mbid`, `role`, `detail`), so a person cannot add the same credit twice, and has an index on (`status`, `submitted_at`) for the review queue. The role set, `source` and `status` are lower-case text with CHECK constraints (decision 0006). A user credit is never inserted into `credits`, and nothing in the MusicBrainz upserts of section 10 touches `user_credits`.
- **Read together, not stored together.** A view over `user_credits` with the same shape as `recording_people` (plus `status` and `author_id`) lets a graph's snapshot, hubs and Text view read both sets; section 9's snapshot labels each credit with its `origin`. `recording_people` itself is unchanged, so MusicBrainz-only readers (recommendations, paths) do not need to know the community table exists.
- **`crawl_jobs.kind` gains `analysis`** (v3), a job that fetches one preview and fills `preview_analysis`.
- **A trust level is not a column.** It is the count of a person's approved credits, read when needed (FR-CREDIT-VOTE-01).
- **FR-WAVE-01 stores nothing**: the browser decodes the preview (decision 0022).

### Conventions

- Tables and columns are `snake_case`; MusicBrainz IDs are `uuid`; timestamps are `timestamptz`.
- Enumerated columns (`credits_status`, `subject_type`, `role`, `source`, `provider`, and the crawl job `kind` and `status`) are lower-case text with a CHECK constraint listing the allowed values (decision 0006).
- Foreign keys are declared wherever the target is a single table: link tables to `recordings`, `works` and `releases`; `credits.person_mbid` to `people`; `previews.recording_mbid` to `recordings`; `graph_songs` to `graphs` (cascade) and `recordings`. `credits.subject_mbid` and `crawl_jobs.target_mbid` are polymorphic and have none. The ingestion order in M2 follows from this: a recording or person row exists before rows that reference it.
- `graphs.owner_id` has no foreign key until ASP.NET Core Identity arrives in v2.
- MusicBrainz dates can be partial. A date is stored as its earliest possible day plus a precision (`1995` is `1995-01-01` with `year`), and the precision is null exactly when the date is null. Ordering uses the date; the UI formats by precision (decision 0008).
- Schema changes go through EF Core migrations, applied at Api startup in Development and as a separate step in production (decision 0003).

### Indexes and constraints

- `credits`: unique on (`person_mbid`, `subject_type`, `subject_mbid`, `role`, `detail`) to make re-crawls idempotent (`detail` is never null, because PostgreSQL treats NULLs as distinct in a unique index); index on (`subject_type`, `subject_mbid`). A separate index on `person_mbid` is not needed: the unique index starts with that column and serves the same lookups.
- `graph_songs`: the primary key (`graph_id`, `recording_mbid`) serves "the songs of a graph"; the foreign key to `recordings` gives an index on `recording_mbid`, which serves "the graphs that hold this recording", asked after every job.
- `crawl_jobs`: unique on (`kind`, `target_mbid`) where `status` is pending or running, so the same fetch is never queued twice; partial index on (`priority` desc, `run_after`) where `status = 'pending'`.
- `recordings.title`: trigram index (`pg_trgm`) for fast local search before falling back to MusicBrainz.
- `releases` (M3R): the four new columns are what FR-ART-01 needs to choose a cover the way FR-SEARCH-02 chooses the original: the earliest official release whose group is neither live nor a compilation, and its group as the fallback. They are filled from the `release-group` object MusicBrainz returns when the recording lookup asks for `release-groups` (section 10); rows fetched earlier have them null until the recording is fetched again (NFR-REL-03), and a null group simply skips that step of the chain.

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

### Community credit and waveform endpoints (v2 and v3; approved 2026-10-14)

| Method | Path | Purpose | Requirement |
| --- | --- | --- | --- |
| GET | `/api/v1/recordings/{mbid}/preview` | Unchanged route; the answer is `{ url, expiresAt }` and the URL is short-lived: it is resolved from the stored track id at the time of the request and expires within about 15 minutes (decisions 0022 and 0025). There is no `durationSeconds`: Deezer's `duration` is the whole song, so the player reads the preview's length from the audio. 404 means no preview, 503 with `Retry-After` means Deezer did not answer; `Cache-Control: no-store`; 60 a minute per address | FR-PREVIEW-01, FR-WAVE-01 |
| GET | `/api/v1/me/credits?recording=` | The signed-in person's own community credits, with status and any rejection reason (v2) | FR-CREDIT-USER-01 |
| POST | `/api/v1/me/credits` | Add a credit `{ recordingMbid, personMbid, role, detail }` to a song in one of the person's graphs; answers `201` with status `private` (v2) | FR-CREDIT-USER-01 |
| DELETE | `/api/v1/me/credits/{id}` | Delete a `private` or `rejected` credit, or withdraw a `submitted` one (v2) | FR-CREDIT-USER-01 |
| POST | `/api/v1/me/credits/{id}/submit` | Send a credit to review with `{ acceptCc0Terms: true, termsVersion }`; `429 /errors/submission-limit` past the daily limit (v2) | FR-CREDIT-REVIEW-01 |
| GET | `/api/v1/admin/credit-reviews?status=submitted` | The review queue, oldest first; `403` without the `admin` role (v2) | FR-CREDIT-REVIEW-01 |
| POST | `/api/v1/admin/credit-reviews/{id}/approve` and `/reject` | Decide a submission; reject needs `{ reason }` (v2) | FR-CREDIT-REVIEW-01 |
| PUT, DELETE | `/api/v1/credits/{id}/vote` | Confirm or dispute an approved community credit (v3) | FR-CREDIT-VOTE-01 |
| GET | `/api/v1/recordings/{mbid}/analysis` | Band peaks, tempo and key, or `404` until the Worker has analysed it (v3) | FR-WAVE-02 |

- **`origin` on every credit.** The graph snapshot's `credits` entries (and the `CreditsResolved` event's) gain `origin`: `musicbrainz`, `you` or `community`, and for the first two a `userCreditId` where one applies so that the person can delete theirs. A credit the person is not allowed to see is not in the snapshot at all. A graph that is not the person's own, or is public, carries `musicbrainz` and `community` credits only.
- **Roles, not a flag.** The admin endpoints require the `admin` role through an authorisation policy; the role is a claim the Api checks, not a request field.
- **Errors** use the same Problem Details shape: `/errors/submission-limit` (429), `/errors/terms-not-accepted` (400), `/errors/credit-not-editable` (409, for a credit that is no longer `private`), `/errors/forbidden` (403).

### Example: search

```json
GET /api/v1/search/recordings?q=Redbone&artist=Childish%20Gambino

200 OK
{
  "source": "musicBrainz",
  "results": [
    {
      "mbid": "7408f11c-6c4e-41e5-b81b-6a15bf6cb268",
      "title": "Redbone",
      "artist": "Childish Gambino",
      "firstReleaseTitle": "Awaken, My Love!",
      "year": 2016,
      "score": 100,
      "creditsStatus": null,
      "versions": [
        { "mbid": "ac5977af-...", "title": "Redbone", "artist": "Childish Gambino", "firstReleaseTitle": "Promo Only: Modern Rock Radio, January 2017",
          "year": 2016, "score": 100, "kind": "compilation", "note": null, "creditsStatus": null,
          "artReleaseMbid": "e493730c-...", "artReleaseGroupMbid": "a208e5e5-..." }
      ],
      "kind": null,
      "artReleaseMbid": "2017e952-...", "artReleaseGroupMbid": "fd817615-..."
    }
  ]
}
```

- `q` is the title (2 to 200 characters); `artist` is optional (up to 200). Results are at most 10, best match first.
- `source` is `cache` when the local cache filled the page by itself, and `musicBrainz` otherwise. It also says what `score` means: MusicBrainz's own 0 to 100 score, or the cache's trigram similarity times 100.
- `year` is `null` when the first release date is unknown, never `0`. `creditsStatus` is `null` when the recording has never been fetched, and otherwise the stored status; the add-song flow serves a recording with a status other than `none` from the cache.
- `kind` (M3R) on a result says what a separate recording of the song is: `remix`, `edit`, `bootleg`, `mixtape`, or `null` for the original. It is derived in this order, and the first rule that decides wins: (1) the recording's own disambiguation comment ("radio edit", "Tsunxmi remix", "bootleg"); (2) the decoration at the end of the title ("(... remix)", "(... edit)", "(... bootleg)"), the way `DuplicateCollapser` already reads "(Live ...)"; (3) the release groups, as a guarded last resort: only when the recording is on at least two groups and all of them are `Remix` (or all `Mixtape/Street`). The groups are last because they describe a release, not a recording: real data lists the original "Telegraph Ave." only on a single whose group has the secondary type `Remix`, and reading the group first tagged the original as a remix. The title rule is tested with real titles and that case is a test. `artReleaseMbid` and `artReleaseGroupMbid` are the release and release group the cover is loaded for (FR-ART-01); either may be `null`, and graph songs carry the same two fields.
- `versions` holds the duplicates folded behind the result, earliest first, each with a `kind` (`live`, `remaster`, `compilation`, `other`) and MusicBrainz's disambiguation comment as `note`. How duplicates are decided is in section 10.
- Errors are Problem Details with these `type` values: `/errors/invalid-search` (400), `/errors/rate-limited` (429, for more than 60 searches a minute from one address, or when the shared MusicBrainz gate has no slot within the wait cap; `Retry-After` says when to try again), `/errors/upstream-unavailable` (503, MusicBrainz busy or too slow) and `/errors/upstream-error` (502, MusicBrainz rejected the query).

### Graphs

An anonymous graph is created without a body or with `{ "name": "..." }` (at most 100 characters; default "Untitled graph") and answers `201` with its address in `Location` and `{ id, name, anonToken }`. The token is shown once; the server keeps only its hash (decision 0007). Every other graph request sends it in `X-Graph-Token`: a missing or wrong token is `401 /errors/invalid-graph-token`, an unknown graph `404 /errors/graph-not-found`.

```json
GET /api/v1/graphs/7c1e...
X-Graph-Token: <token>

200 OK
{
  "id": "7c1e...", "name": "Late night",
  "seq": 17,
  "songs": [{ "mbid": "7408...", "title": "Redbone", "artist": "Childish Gambino", "year": 2016,
              "creditsStatus": "complete", "addedAt": "2026-10-12T09:09:45Z",
              "artReleaseMbid": "2017e952-...", "artReleaseGroupMbid": "fd817615-..." }],
  "people": [{ "mbid": "1ba0...", "name": "Donald Glover" }],
  "credits": [{ "songMbid": "7408...", "personMbid": "1ba0...", "role": "songwriter", "detail": "", "level": "recording" }],
  "hubs": [{ "personMbid": "1ba0...", "songs": 2, "roles": ["songwriter", "vocal"] }],
  "crawl": { "queued": 0, "done": 5, "failed": 0, "etaSeconds": 0 }
}
```

- **One snapshot.** `songs` are oldest first. `credits` has one entry per song, person, role and detail (FR-GRAPH-03), kept at the level closest to the recording when the same credit exists on the recording and on its work. `hubs` lists people credited on two or more songs, most songs first (FR-HUB-02).
- **`seq`** is the number of the last event sent for this graph, read **before** the data. Any event with a higher number is newer than the snapshot or already part of it, and applying an event twice changes nothing, so a client that joins the hub first, then loads the snapshot, and drops events with `seq` at or below the snapshot's, cannot miss or double-count anything.
- **`crawl`** counts the crawl jobs for the graph's songs: the recording fetches and the work and release fetches they led to. `etaSeconds` is queued jobs times the gate interval (one request a second).
- **`creditsStatus`** is `loading` while a recording, work or release fetch for the song is pending or running, and otherwise the stored `complete`, `partial` or `none`.
- `DELETE /api/v1/graphs/{id}/songs/{mbid}` answers `204`, or `404` when the song is not in the graph; the recording and its credits stay in the cache. A graph holds at most 50 songs: adding a 51st is `409 /errors/graph-full` (FR-GRAPH-01).
- Adding songs is limited to 20 a minute per address (NFR-SEC-02).

### Example: add a song

```json
POST /api/v1/graphs/7c1e.../songs
{ "recordingMbid": "b1a9..." }

202 Accepted
{
  "song": { "mbid": "b1a9...", "title": "Redbone", "artist": "Childish Gambino", "creditsStatus": "loading" },
  "pendingJobs": 1
}
```

`pendingJobs` counts the jobs outstanding for the song and starts at 1: the Worker queues the work, release and preview jobs after it has fetched the recording (decision 0009). Progress is therefore reported as a growing queue, never as "n of 4".

The answer is `202` while credits are being fetched. It is `200` with `pendingJobs: 0` when the credits were already cached (the graph's browsers are sent them as events at once), and `200` when the song was already in the graph. The body carries no title: the title and artist come from MusicBrainz (decision 0019). A recording MusicBrainz does not know is `404 /errors/recording-not-found`; MusicBrainz busy or slow is `429` or `503` with `Retry-After`, as for search.

### SignalR hub events

Clients join a group per graph with `JoinGraph(graphId, token)` and leave it with `LeaveGraph(graphId)`. The token is an argument of the hub method, in the body of the message: a browser's WebSocket cannot send a header, and a token in the URL would reach logs (decision 0019). A wrong token and an unknown graph give the same refusal. The hub is at `/hubs/graph`, on the same origin as the app; the server sends:

| Event | Payload | When |
| --- | --- | --- |
| `CreditsResolved` | `{ songMbid, people: [{ mbid, name }], credits: [{ personMbid, role, detail, level }], artReleaseMbid, artReleaseGroupMbid }` | A recording, work or release fetch finishes; the two cover ids are the song's cover as known now (`null` while no release is known), so a song added before its releases were fetched learns them (FR-ART-01) |
| `SongStatusChanged` | `{ songMbid, creditsStatus }` | A song becomes complete, partial or none |
| `HubsUpdated` | `{ hubs: [{ personMbid, songs, roles }] }` | Hub counts change, debounced to once per second |
| `CrawlProgress` | `{ queued, done, failed, etaSeconds }` | Every completed job for this graph |
| `CrawlFailed` | `{ songMbid, reason }` | A job exhausts its retries |

Every message carries `seq`, a number that grows by one for each message of its graph (a Redis counter, so it holds across the Api and the Worker). On reconnect the client joins again, calls `GET /graphs/{id}`, and drops messages with a `seq` at or below the snapshot's.

- `CreditsResolved` is sent for every song a finished job concerned, with that song's credits at all levels; a credit already known is simply sent again, and the client merges by (person, role, detail).
- `SongStatusChanged` is sent only when the status a graph was last told changes. `loading` is a status: the first event after an add is the change out of `loading`.
- `HubsUpdated` is sent at once the first time and then at most once a second per graph; requests inside the second share one trailing send that reads the hubs at the moment it is sent. It is also sent when a song is removed.
- `CrawlFailed` carries a reason written for the person, never the exception text.
- Events are best effort. A browser that misses one loads the snapshot when it reconnects; a failure to send never changes the outcome of a job.

## 10. External integrations

MusicBrainz is the primary source for all credit data; Discogs fills gaps, Deezer supplies previews, and Spotify is limited to an optional export because of its 2026 developer restrictions.

| Service | Used for | Auth | Limit | Notes |
| --- | --- | --- | --- | --- |
| MusicBrainz | Search, recordings, works, releases, people, credits | None; descriptive User-Agent required | About 1 request per second per IP; excess returns 503 | Primary source ([rate limiting](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting)) |
| Discogs | Credit enrichment when MusicBrainz has none (v2) | Personal access token | 60 per minute authenticated, 25 unauthenticated | Release `extraartists` carries roles ([API docs](https://www.discogs.com/developers)) |
| Deezer | 30-second previews | None | Public API; preview URLs expire | Matched by ISRC (`GET /track/isrc:{isrc}`); the title-and-artist fallback is not built, because a wrong preview is worse than none (decision 0025). **A miss is HTTP 200 with `{"error":{"code":800}}`.** Own shared gate at 200 ms (Deezer documents 50 requests every 5 seconds; not re-verified). Checked 2026-10-14: the preview URL is signed and expires 15 minutes after it is issued, so only the track id is stored; the audio host (`cdnt-preview.dzcdn.net`) sends `Access-Control-Allow-Origin: *`, the API host does not (decision 0022) |
| Cover Art Archive | Album art (FR-ART-01, M3R) | None | Public images; fair use | Loaded by the browser from `coverartarchive.org`, which redirects to `archive.org` and on to a data node; not an API call and never through the MusicBrainz gate |
| Spotify | Optional playlist export (v2) | OAuth with PKCE | Development Mode only | See constraints below |

### MusicBrainz fetch plan per song

1. `GET /ws/2/recording?query=+recording:"{title}" +artist:"{artist}" status:official^10` for search: title and artist are required, and a recording on an official release is boosted, so the original is in the first results of a song that has hundreds of bootleg recordings. The Api makes this call itself, because a search must answer in the same request (decision 0018).
2. `GET /ws/2/recording/{mbid}?inc=artist-credits+artist-rels+work-rels+releases+isrcs` for recording-level credits, the linked work, releases and the ISRCs, which are stored on the recording (`recordings.isrcs`) for the preview job.
3. `GET /ws/2/work/{workMbid}?inc=artist-rels` for composer, lyricist and writer credits.
4. `GET /ws/2/release/{releaseMbid}?inc=artist-rels` only when steps 2 and 3 found no producer.
5. `GET /ws/2/artist/{mbid}?inc=recording-rels+work-rels` when a user opens a person drawer.

The preview job (kind `preview`) is not a MusicBrainz step: it reads the recording's stored ISRCs, asks Deezer (`GET /track/isrc:{isrc}`, at most three ISRCs), and stores the track ID and the album image ID when Deezer has a preview. A recording Deezer does not know, or knows without a preview, ends the job with no row. A quota or busy answer leaves the job to retry.

Each step is a separate `crawl_jobs` row, so a failure retries only that step. The Api queues only the recording job: the work and release IDs and the ISRC are only known from its response, and the release step is conditional, so the Worker queues steps 3 and 4 and the preview job itself (decision 0009). The User-Agent is `Nodeable/{version} ( {contact} )`, the format MusicBrainz asks for. The contact is a URL or an email address and comes from configuration (`MusicBrainz:ContactUrl`); it is the repository URL, so no personal address is published, and the app refuses to start without one.

### How the client calls MusicBrainz (implemented in M2)

- **One typed client, one pipeline.** Every call goes through `IMusicBrainzClient`. An `HttpClient` pipeline wraps it, outermost first: a total timeout (5 minutes), retry, the rate gate, a request counter, and then the network. A per-attempt timeout (30 seconds, which includes the wait for the gate) sits inside the retry.
- **The gate is inside the retry.** A retry after a 503 is a new request and waits for its own slot, so retries cannot push the system over 1 request per second (NFR-RATE-01 and NFR-RATE-03 together).
- **Rate gate.** A token bucket in Redis (the single-number GCRA form), run as one Lua script so concurrent instances cannot take the same slot, using Redis's own clock. Defaults: one request per second, burst of 1. A caller that would have to wait more than 20 seconds is refused with `RateGateSaturatedException` instead of queueing without a limit; the job queue retries the job later.
- **Retries.** 503 and 429 are retried up to 5 times with exponential backoff from 2 seconds and jitter; a `Retry-After` header replaces the calculated delay. Network failures and a timed-out attempt are retried the same way. Other errors, such as 400, are not. After the last retry the call fails with `MusicBrainzException` carrying the status and MusicBrainz's own message.
- **Not found.** A 404 for an MBID returns `null`, not an error. MusicBrainz redirects merged MBIDs by itself.
- **Strict parsing.** A response missing a field the typed model requires fails the call, so a changed API shows up as an error and not as nulls in the cache.
- **Telemetry.** A `musicbrainz.fetch` client span per call (`mb.entity`, `mb.inc`, `http.response.status_code`), a `ratelimit.acquire` span per attempt (`ratelimit.source`, `ratelimit.wait_ms`), and the `external.requests` counter per HTTP attempt. The time spent waiting for the gate is also the `ratelimit.wait` histogram.

### How credits are stored (implemented in M2)

- **One handler per step.** The `recording` handler stores the recording (title, artist credit, first release date with its precision, length), its releases and linked works with the link rows, and its recording-level credits. The `work` and `release` handlers store that entity's credits. Each handler writes in one transaction, so a reader never sees a recording with its releases but without its credits.
- **Idempotent.** People are upserted by MBID; credits are inserted with `ON CONFLICT DO NOTHING` on the unique index; links likewise. Running a job twice, which a crash or a refresh causes, changes nothing. Batches are written with `unnest` arrays: one statement per table, not one per credit.
- **What is a credit.** Only relationships whose target is an artist. Each is mapped with the role table below; repeated (person, role, detail) tuples, such as a person credited with `mix` and `additional mix`, are one credit.
- **`credits_status`.** Computed from every credit the recording has at recording, work and release level, and recomputed after each step: `complete` when a producer and a songwriter are both credited, `partial` when something is credited but not both, `none` when nothing is. FR-GRAPH-04's "no producer and no writer" badge is therefore the absence of both roles, which the API reads from the roles themselves. A song with a status other than `none` is served from the cache without a new fetch.
- **Follow-up jobs** are queued by the recording handler after its transaction commits, inside its `crawl.job` span, with its priority: a `work` job per linked work; a `release` job for **one** release, the earliest dated (original releases carry the production credits, and every fetch costs a second of the shared budget), only when the recording has no producer credit at any level; and a `preview` job (target: the recording) when an ISRC is known, **only when `Ingestion:QueuePreviewJobs` is on**. That switch is off until the preview handler exists (FR-PREVIEW-01, M4), because a job of a kind nobody handles would only be marked failed.
- **The release decision is made at the recording step.** Decision 0009 says "after the recording and work steps", but MusicBrainz has no producer relationship between an artist and a work (only composer, lyricist, writer and similar), so the work step cannot change the answer.
- **Unknown entities.** MusicBrainz answering 404 for a job's MBID marks that job failed at once (a permanent failure) instead of spending retries.

### How search works (implemented in M3)

- **Cache first.** The local `recordings` table is searched by title with the trigram index (`pg_trgm`), optionally narrowed by artist. When the cache alone fills a page (10 results after duplicates are folded), it answers and MusicBrainz is not asked. With fewer, MusicBrainz is asked too, because it may know songs the cache has never seen; its answer replaces the cache's, and each result says what the cache already holds for it.
- **One request.** MusicBrainz is asked for 30 recordings, so that folding duplicates still leaves a full page. The query prefers recordings on an official release without excluding any (a boosted optional clause, step 1 of the fetch plan): a famous song has hundreds of bootleg recordings that all score 100, and without the preference the original can fall outside the 30. The answer is large, several hundred kilobytes for such a song, because each recording lists every release it is on.
- **Interactive profile.** The Api uses the same pipeline as the Worker with shorter limits, set in its configuration: a wait for the gate of at most 2 seconds, one retry, 5 seconds per attempt and 12 seconds in total. A search that cannot get a gate slot in 2 seconds is refused with 429 instead of waiting. The gate has no priority lanes: the Worker takes one slot at a time, so a search waits for at most the slot after the one the Worker is about to use.
- **Duplicates.** Two recordings are the same song when they have the same title and artist once case, accents, apostrophes and punctuation are ignored, and a live or remaster decoration ("(Live at Wembley)", "- 2011 Remaster") is removed. Remixes, edits, acoustic and instrumental versions are different recordings (different people made them) and keep their own row.
- **The original.** The row that stays is the recording with an official release that is neither a live album nor a compilation, earliest first; promotions and bootlegs never win. A recording whose releases are unknown (a cache row) is not marked down. The folded recordings keep their reason: live, remaster, compilation or other.
- **First release.** The title and year shown are those of the official release with the earliest date.

### Persist, then reuse (NFR-CACHE-01; stated 2026-10-14, describes M2 and M3 as built, except the refresh)

The database grows with use, and what it holds is read before MusicBrainz is asked. The rule is already implemented by the flows above; this table gathers it, with the one boundary people tend to assume away.

| When | What is persisted | Where it is specified | What reuses it |
| --- | --- | --- | --- |
| A song is added to any graph | The `recordings` row (title, artist credit, dates, length), the `releases` and `works` it links to and the link rows, the `people` it credits and every `credits` row at recording, work and release level, with `credits_status` | Section 7 (flow, steps 2 to 5); "How credits are stored" below; section 8 | Adding the same recording to any graph: a stored recording with a status other than `none` makes **no** MusicBrainz request and its credits go to the browser at once (section 7, step 3). Hubs, the liner notes and, from M4, recommendations and person pages read the stored rows |
| A song is searched for | **Nothing.** A search result is not stored; only a song someone adds is (decision 0019: the shared cache never receives a title a person did not add) | "How search works" above | Search reads the stored `recordings` by title with the trigram index **before** it asks MusicBrainz. It does not skip MusicBrainz unless the stored rows alone fill a page of 10 after duplicates are folded; with fewer, MusicBrainz is asked as well, so a small database still calls MusicBrainz on most searches and the call is avoided more often as the database grows |
| A stored row is older than 30 days | The refresh rewrites it in the background. **Not built:** no job implements NFR-REL-03 yet (it is a task in M4, section 14), so stored rows are not refreshed today | NFR-REL-03 | The same readers |

So every song added (recording, releases, works, people, credits) is persisted and is reused first by both search and add-song; the saving shows up as fewer MusicBrainz requests per search as the stored recordings grow, and `cache.lookups` (`recording_search` hit or miss, section 11) is the measure of it. What is **not** specified, and not proposed here, is persisting search results that nobody added: it would put titles and MBIDs the person never chose into the shared cache.

### Album art (FR-ART-01, M3R)

The browser loads the cover itself, with an `<img>`; the Api and the Worker make no request for it. The chain, stopping at the first image that loads:

1. `https://coverartarchive.org/release/{releaseMbid}/front-250` (and `front-500` for sizes above 125 CSS pixels, through `srcset`), the release the Api chose as the song's cover (section 8).
2. `https://coverartarchive.org/release-group/{releaseGroupMbid}/front-250` (and `front-500`).
3. The Deezer album cover (`cover_medium` / `cover_big`, on `cdn-images.dzcdn.net`). The URL comes from the Deezer lookup that FR-PREVIEW-01 adds in M4, so this step is wired in M3R and has data from M4.
4. A generated flat **sleeve**: an inline SVG whose background, mark colour and pattern (one of a small set of geometric marks) are chosen by hashing the recording's MBID, so a song always has the same sleeve. It is also what shows while an image loads and when every step has failed.

Rules: images are fixed-size and `loading="lazy"` (no layout shift), have `alt` text ("Cover of {album}" for a loaded image, empty for the decorative sleeve), carry `referrerpolicy="no-referrer"` and no credentials, and a failed image (a `404` from the Cover Art Archive means no art) moves to the next step without an error shown. Verified on 2026-10-13: the Cover Art Archive answers a missing front image with `404`, and redirects found images by `307` to `archive.org` and then `302` to a data node such as `dn721801.ca.archive.org`; the Deezer image host is `cdn-images.dzcdn.net`. All of them send `Access-Control-Allow-Origin: *`, which the canvas renderer needs to draw a cover (the constellation above its threshold).

Privacy: each image request tells the image host the person's IP address and that Nodeable's page asked for it (without a referrer). That does not breach NFR-PRIV-01 (no cookies, no analytics sent to third parties) but it is stated here; an image proxy through the Api is the remedy if it ever matters, and is not built.

### Community credits (approved 2026-10-14, v2 and v3; decision 0021)

- **Licence.** MusicBrainz's core data, which includes relationships and so every credit Nodeable reads, is CC0; its supplementary data (annotations, tags, ratings, derived statistics, edit history) is CC BY-NC-SA 3.0 (checked 2026-10-14 on musicbrainz.org/doc/About/Data_License and /doc/MusicBrainz_Database). Nodeable reads core data only. A person who submits a credit accepts CC0 for it, so an approved credit has the same terms as MusicBrainz's and can be given to MusicBrainz without a conflict (NFR-LIC-01).
- **Where credits live.** MusicBrainz's in `credits`, the community's in `user_credits` (section 8), never in the same table, upsert or unique index. A refresh from MusicBrainz cannot overwrite or delete a user credit.
- **What each person sees** (FR-CREDIT-USER-01, FR-CREDIT-REVIEW-01):

| Status | Seen by | Label | How it gets here |
| --- | --- | --- | --- |
| `private` | its author | "Added by you" | The person adds it (v2) |
| `submitted` | its author, and the reviewer in the queue | "Awaiting review" | "Submit for review", after accepting CC0 (v2) |
| `approved` | everyone | "Community" | The `admin` approves (v2); in v3 also by trust level or by votes |
| `rejected` | its author, with the reason | "Not accepted" | The `admin` rejects with a reason (v2) |
| `superseded` | not drawn; kept for the record | | A refresh found the same (person, role, detail) in MusicBrainz |

- **Superseding.** At the end of a recording's refresh, in its transaction, each non-superseded user credit on that recording whose (person, role, detail) is now in `credits` becomes `superseded` and gets an audit row. A user credit never hides a MusicBrainz credit, and MusicBrainz's credit is the one drawn.
- **How a credit's person is chosen.** The person must be a MusicBrainz artist (an MBID): from the people already stored, or found through MusicBrainz's artist search through the shared gate (section 10, interactive profile). A name with no MBID is not accepted (open question, section 15).
- **What does not change.** `credits_status` and the "credits incomplete" badge describe MusicBrainz's data (decision 0015), and "Add credits on MusicBrainz" stays; an approved credit also offers "Submit to MusicBrainz", a link to the song's MusicBrainz page where the person makes the edit themselves. Nodeable never writes to MusicBrainz.
- **Where each set is used.** The author's own graph shows all their credits, and its hubs and cards count them. Public graphs (FR-SHARE-01), recommendations (FR-REC-01) and paths (FR-PATH-01) use MusicBrainz's and `approved` credits only. Every credit in the views carries its label as a word and an icon (NFR-A11Y-02).
- **Abuse limits.** Sign-in is required; a daily submission limit per person; `detail` is length-limited and shown as text; the queue is read by one reviewer, so its length and the age of its oldest item are metrics when it is built (NFR-SEC-05, section 11).
- **Votes and trust (v3, FR-CREDIT-VOTE-01).** A vote is "confirm" or "dispute" on an approved community credit; a credit disputed by more people than confirmed it (the numbers set at the v2 retrospective) returns to the queue. A person with 5 or more approved credits and none rejected in the last 90 days is trusted: their submissions are approved without the queue but still get an audit row, and the reviewer can sample them. The 5 and the 90 days were approved on 2026-10-14.

### Preview waveform (approved 2026-10-14, M4 and v3; decision 0022)

- **FR-WAVE-01 (M4).** The page fetches the preview audio from the URL the Api returns (resolved from the stored track id, valid for about 15 minutes), decodes it with Web Audio's `decodeAudioData`, folds it to mono and reduces it to a fixed number of peaks (the maximum absolute sample per bucket, 160 buckets), and draws them with D3 as bars with a playhead. The audio element and the playhead share one clock, a click or arrow key on the waveform seeks (it is a slider with `aria-valuetext` such as "0:12 of 0:30"), and the record spins only while playing. Nothing is stored: not the audio and not the peaks.
- **Checked on 2026-10-14 (decision 0022).** The preview audio answers with `Access-Control-Allow-Origin: *` to both a ranged `GET` and a preflight, so the browser may read the bytes; the Deezer API host sends no such header, so the Api, not the browser, asks it. The check is repeated at the start of M4. If the header is gone, the Worker fetches the preview, computes the peaks and the duration and stores them (the audio is never stored), and this subsection is rewritten.
- **When it cannot be decoded** the player plays without a waveform and shows a progress bar and the time; the waveform never blocks a preview (FR-PREVIEW-01).
- **FR-WAVE-02 (v3).** An `analysis` job in the Worker fetches one preview at a time at the scheduled priority, splits it into three bands (low, mid, high), keeps peaks for each, estimates the tempo and, as a stretch, the key, and stores them in `preview_analysis` with an `algorithm_version`, so a better algorithm can recompute. The browser draws three coloured layers (band colours also differ by pattern or lightness, not by hue alone: NFR-A11Y-02) and shows the BPM as text; when a row exists FR-WAVE-01 reads its peaks and does not decode. With reduced motion the waveform is static (drawn at once, with no draw-in and no motion that follows the sound).
- **Before FR-WAVE-02 starts:** Deezer's terms are read for whether the audio may be analysed and derived values stored (not checked), and the MP3 decoder and the tempo and key algorithms are chosen and tested against recordings of known tempo (section 15).

### Role mapping

| MusicBrainz relationship type | App role |
| --- | --- |
| `producer`, `co-producer`, `executive producer` | Producer |
| `composer`, `lyricist`, `writer` | Songwriter |
| `mix`, `mix-DJ` | Mixing |
| `engineer`, `recording`, `mastering`, `sound` | Engineering |
| `instrument` (detail from attributes, for example "bass guitar") | Instrument |
| `vocal` (detail from attributes, for example "background vocals") | Vocal |

Unmapped relationship types are stored with role `Other` and their raw type in `detail`, so nothing is lost. Matching ignores case. When a relationship has several attributes they are joined in alphabetical order with duplicates removed, so reading the same relationship twice gives the same `detail` and the credits unique index keeps re-crawls idempotent.

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
| `search.recordings` | Internal | `search.source` (cache or musicbrainz), `search.cache_matches`, `search.candidates`, `search.results`, `search.collapsed` |
| `crawl.enqueue` | Internal | `crawl.kind`, `crawl.target_mbid`, `crawl.deduplicated` |
| `crawl.job` | Consumer; a child of the `crawl.enqueue` span, restored from the stored `traceparent`, so the job is in the same trace as the request that queued it | `crawl.kind`, `crawl.attempt`, `crawl.queue_wait_ms`, `crawl.target_mbid` |
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
| `crawl.queue.wait` | Histogram | `kind` | Time a job was ready to run before a worker claimed it |
| `ratelimit.wait` | Histogram | `source` | Time a request waited for its slot in the shared rate gate |
| `external.requests` | Counter | `source`, `status_code` | Rate limit and error tracking |
| `cache.lookups` | Counter | `entity`, `result` (hit, miss, stale) | Cache hit ratio |
| `graph.time_to_first_hub` | Histogram | `cached` (true, false) | The headline user-facing metric |
| `signalr.connections` | UpDownCounter | none | Live users (implemented in M3) |
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

The frontend is a Vite single-page app in TypeScript, organised by feature. MUI supplies inputs, buttons, dialogs and sheets and takes its look from the theme tokens; D3 supplies the maths (hierarchy and radial layout, forces, scales, zoom, drag, easing); React owns the DOM everywhere, including the SVG views, and the one canvas. The visual and interaction reference is `docs/design/nodeable-ui-prototype.html` (decision 0020); its data is fake and none of its code is ported.

> **Status:** this section describes the M3R UI refresh, which is **approved** (decision 0020) and being built, pull request by pull request. The landing page, the sheet and the results are in, and so is the `/graph` page, which was replaced **in one pull request** (the third, after the first screens were reviewed): the orbit, the strip, the legend filters, the connector cards, the liner notes and the Text view. Still to come, in the fourth pull request: the constellation and the Orbit / Constellation toggle, "Find in your graph", the connector cards' FLIP reorder and count-up, and the new-credit highlight. Where this section describes those, the code does not have them yet.

### Folder structure

```text
web/
  src/
    app/            routes, providers, theme and design tokens, query client
    api/            generated OpenAPI types, fetch client, SignalR connection
    features/
      landing/      hero, record-disc illustration, steps
      search/       search form, results list, versions disclosure, search sheet
      graph/        graph model, live graph hook, event reducer, Text view (tables), role legend and filters
      orbit/        OrbitView: radial layout, polar transitions, role arcs, breadcrumbs, tooltip, focus
      constellation/ ConstellationView: SVG force view and, above the node threshold, the canvas renderer
      connectors/   connector cards (FLIP reorder, count-up)
      notes/        liner notes (credits of each song grouped by role)
      art/          Sleeve (generated), AlbumArt (the fallback chain)
      person/       person drawer (M4)
      recs/         recommendations list, preview player (M4)
      about/        architecture, live crawl status
    motion/         useReducedMotion, FLIP, count-up
    stores/         Zustand stores (view and trail, role filters)
    telemetry/      OpenTelemetry web setup
    test/           test utilities and MSW handlers
  scripts/          build-time scripts (first-load bundle budget check)
```

Routes after M3R: `/` is the landing page, `/graph` is the workspace (orbit or constellation), `/about` is a lazy route and every other address is the not-found page. The workspace's state is in the address, as the search always has been: `/graph?view=orbit|constellation&focus=song:<mbid>|person:<mbid>` (no `focus` is the whole graph), so a view can be reloaded and shared by copying the address (a share link to a public graph is v2's `/g/:slug`). The search stays in `q` and `artist`, on the landing page and in the sheet. `/graph` with no graph in the browser redirects to `/`.

### State

- **Server state** (the graph snapshot, people, recommendations) lives in TanStack Query. SignalR events update the cache with `setQueryData` through the reducer (`applyGraphEvent`), so components never subscribe to the socket themselves. Everything animated on screen reads from that cache; an animation is a function of the data, never a second copy of it.
- **UI state** lives in small Zustand stores: the orbit's trail (the centres visited, the last of which is the centre) and the active view, and the role filters.
- **The current search** lives in the address; the results are server state keyed by title and artist.
- **Anonymous graphs** store their `id` and `anonToken` in `localStorage`, wrapped in try/catch. A graph the server answers `401` or `404` for is forgotten.
- **The live graph** is one query per graph. The page connects, joins the graph's group and only then loads the snapshot; events that arrive before it are kept and replayed on top of it, those at or below its `seq` are dropped, and a reconnect joins again and reloads (section 9).

### Networking

- The browser makes **same-origin** requests for the Api (`/api`, `/hubs`) and telemetry (`/otlp`); Vite's dev server proxies them in development and Caddy does in production, so there is no CORS configuration (decision 0004).
- The one exception is **album art**: `<img>` elements load cover images straight from the Cover Art Archive and the Deezer image CDN (section 10). They carry no cookies, no credentials and no `Referer`.
- The API client is `openapi-fetch`, typed by the generated `paths`, and looks `fetch` up on each call so that tracing installed after first paint still applies.

### Theming and design tokens

- The theme is dark first, flat (no gradients, no shadows beyond a focus ring) and built from tokens in `theme.ts`. The prototype's values are the starting point: surfaces `#101113` / `#16171A` / `#1E2024`, hairlines `#2A2C31`, text `#F4F2EE` and muted `#9B9DA4`, one accent yellow `#FFD23F`, and an "ok" green `#4CD07D`. Radii are 4, 10, 12, 16 and 18 px. A **stronger border token** (3:1 against the surface) is used for the outline of inputs and buttons, because the prototype's hairline is not enough for a control's boundary (WCAG 1.4.11).
- **Type:** display and headings are **Archivo** (variable, `wdth` axis, set condensed and in capitals), body is Archivo at normal width, and labels, counts and kickers are **JetBrains Mono**. Both are self-hosted from `@fontsource-variable/archivo` and `@fontsource-variable/jetbrains-mono`, only the latin subsets are declared (about 90 KB and 40 KB of woff2) with `font-display: swap`, and the stylesheet that declares them is imported **after the first paint** (`main.tsx`, like telemetry), so a font is never a request the first paint is measured against. The page is readable in the system fonts at once and the faces swap in; the header's rows do not depend on text width, so the swap moves nothing. No third-party font request is made.
- **Role colours** (one per role, with its icon): producer `#FFD23F` (tune), songwriter `#FF6B4A` (edit), mixing `#3EC6E0` (equalizer), engineering `#8B7BFF` (settings), instrument `#4CD07D` (piano), vocal `#FF7AC6` (mic), and `other` `#9B9DA4` (more) labelled from its `detail` (decision 0010). Each has a dark and a light value and is tested for at least 3:1 against both surface colours; text is tested for at least 4.5:1. **Colour is never the only signal (NFR-A11Y-02):** the legend chip carries the icon and the name, the role arcs and liner-notes rows carry the name in text, and a node's accessible label lists its roles in words. The prototype's colour-only legend is replaced.
- The legend chips are also the **role filters** (FR-HUB-03): `aria-pressed`, with the off state outlined and struck through. A chip **toggles** its role: it turns that role off or on and leaves the others as they are (it does not show only that role). Filters apply to the orbit, the constellation, the connector cards, the liner notes, the counts and the Text view; connectors are worked out again from the credits that remain. The "credits incomplete" badge is still judged from every credit. **A filter is said out loud:** while any role is off, a bar under the headline reads "Filtered by role · showing Producer, Songwriter" (or "hiding Mixing" when fewer roles are off than on), says that the counts, connectors and cards only count these credits, and has "Show all roles"; the four counts get a dashed outline and a "Filtered" tag and their group is named "Totals, filtered by role".
- MUI components are restyled through the theme (`components` overrides), not with one-off `sx` on each use. A light scheme is derived from the same tokens and covered by the same contrast tests; the toggle stays.
- Pages that are not needed for the first render are lazy routes with a loading bar; the app bar has a skip link and labelled landmarks (NFR-A11Y-01).

### Views and layout

**Landing page (FR-LAND-01).** A hero ("Every song has a crew.") with the search form (title, optional artist) and a few "try" chips, a slowly turning record-and-crew illustration (an inline SVG with CSS rotation, not D3, so it stays in the first-load chunk), three steps, and a footer that credits MusicBrainz. When a graph exists the page offers "Back to your graph · n songs". Search results appear under the form.

**Header.** Brand, the page links, and on the workspace "Find in your graph" and the Orbit / Constellation toggle, then "+ Add a song" (which opens the search sheet) and the theme toggle. **Find in your graph (FR-GRAPH-05)** is a combobox over the songs and the people who are in the graph right now (a removed song or a hidden person is not offered), at most thirty matches at a time, grouped as Songs and People; choosing one makes it the orbit's centre (and switches to the orbit). **The toggle** (`aria-pressed`) is `?view=constellation` in the address, and no parameter for the orbit. Both are rendered into the app bar by the workspace through a portal, so they read the workspace's own state without the shell knowing it; on a phone they take a row of their own.

**Strip.** A headline that names the most connecting people ("Donald Glover & Ludwig Göransson each connect 4 of your 6 songs") and four counts (songs, people, credits, connectors) that count up when they change.

**Search sheet (FR-SEARCH-01, FR-SEARCH-02).** An MUI dialog (focus trapped and returned, Escape closes). Each result row: the sleeve (section 10), the title with a tag for what kind of recording it is, artist and first release, a "match" meter and its percentage as text, and a disclosure "n more versions" that expands the folded live, remaster and compilation takes. "Add to graph" becomes "In your graph" and, once added, moves the orbit to that song. Results and version rows rise in with a stagger.

**OrbitView (FR-VIEW-01, FR-VIEW-04, FR-HUB-01).** SVG. The centre is the whole graph (the default), one song or one person.

- **The whole graph (FR-VIEW-04).** With no focus the centre is a hub disc labelled with the number of songs; the first ring is every song, each a record with its **cover** as the label, and the second ring is their people (a person on two songs is drawn once, with a dashed cross-link from the other). Each song has an equal wedge of the circle and its people fan out inside it, so songs that share nobody sit apart instead of being pushed together. The hub's links to its songs are plain; arcs are not drawn. Above 16 songs the first ring's names are left off (the tooltip and the accessible name give them).
- For a song, the first ring is its people, ordered and grouped by their main role on it, with **role arcs** drawn inside the ring and the role's name set along each arc. For a person, the first ring is their songs. The second ring is the other side again: the people on those songs, or the other songs those people are on. A node reachable from two parents is drawn once, with a dashed cross-link.
- Layout is `d3-hierarchy`'s `tree().size([2π, 1])` with a separation that widens siblings of different parents; links are `linkRadial`; the first ring is at 0.55 of the radius (0.62 above 24 nodes, 0.7 when there is no second ring) and the second at the full radius. **The tree is fitted to the stage** (a pure function of the data and the stage's size): the radius is the largest at which every disc and every name is inside the free part of the stage (what the breadcrumbs above and the legend below leave), found by bisection over the box the tree really fills, and the tree is centred in that box. Nodes and names grow with the room: node discs up to 1.5 times the design size, names 12 px and up to 14.4 px, and **never under 12 px**. A second-ring name runs outward along the radius to the room that node has before the stage's edge (long on the sides, short at the top and bottom, where at least nine characters are kept); when keeping nine characters would cost more than 40% of the radius (a small stage), the second ring is drawn without names. **A name is shown whole when it fits; when it does not it is wrapped at a word boundary into two balanced lines (where the neighbours are far enough apart for two lines); only then is it cut, at the end of a word with an ellipsis, and inside a word only when the boundary would leave next to nothing; the hovered or focused node always shows its whole name, and the tooltip always has it.** A song's people ring puts each name on the outer side of its node, so a name never crosses a role arc's text. The view is put back to the fit on every re-root and every resize, so a pan or zoom never leaves the new tree off screen. **Hit areas (WCAG 2.2, 2.5.8).** A node is drawn at its size (a person's disc can be 10 px across on a phone) but takes a press in an invisible circle of at least 12 px radius, 24 px across, and never smaller than its disc; the circles of one ring do not overlap. The layout moves the nodes of a ring apart along it, in their order, until they do not; when a ring has more nodes than its circumference holds at 24 px each, the people with the fewest songs (then by name) go into the ring's "+N more" node and the orbit is laid out again, so a phone's ring is thinner than a desktop's and the Text view has everyone. **The whole graph's songs are never thinned (FR-VIEW-04):** with more songs than a ring holds at 24 px, their hit areas shrink to share the circle without overlapping, and the same action is on the find box, the connector cards, the liner notes and the Text view. The second ring shows at most 60 nodes (connectors first, then by name); the rest are one "+N more" node that turns the Text view on with every person listed.
- Songs are records (the sleeve art on the label, turning while the record is the centre or its credits are `loading`); people are discs with their initials, ringed by one segment per role they have, sized by how many of the graph's songs they are on, and a connector (two or more songs) has a ripple. Labels for the second ring are set along the radius.
- **Re-rooting (FR-VIEW-01).** Clicking, or pressing Enter or Space on, any node makes it the centre. The trail of centres is shown as breadcrumbs: **"Your graph" first, always**, then the last three centres with an ellipsis between when there are more, and a breadcrumb returns to that centre (the browser's back button does too: the centre is the address). Nodes then **move**: each node's angle goes the short way round and its radius moves linearly, over about 950 ms with a cubic ease; entering nodes start at their parent; leaving nodes fold inward and fade. All of it runs from one `d3-timer` that writes SVG `transform` and `d` attributes once a frame.
- **Focus mode.** Hovering or focusing a node dims everything except its path and neighbours, and a tooltip lists the person's roles on the centre song (with detail such as an instrument) or the song's year, album and number of credits. The tooltip appears on keyboard focus too.
- **Streaming bloom (FR-GRAPH-02).** When `CreditsResolved` events apply, the new people enter one after another (a 32 ms stagger) from their song, and the liner-notes row they belong to highlights; a song still `loading` shows a live indicator and "Listening for credits". With reduced motion they simply appear.
- **A song with nothing to show (FR-GRAPH-04).** When the centre song has no credits at all (and is not loading), the stage shows its cover large at the centre (188 px, 132 px on a phone) and, in 17 px type, "No credits on MusicBrainz yet · Add them", the link opening the recording on MusicBrainz in a new tab; no ring or guide is drawn. When it has credits and the role filters or hidden people leave none, the same place says "Every credit on this song is filtered out or hidden" with "Show all roles".
- **Accessibility.** The SVG has `role="group"` and a name (not `img`, which would hide the nodes from assistive technology); every node is a button with a label such as "Put Donald Glover at the centre; credited as producer, songwriter and vocal on 4 songs"; the centre is not in the tab order.

**ConstellationView (FR-VIEW-02, FR-HUB-01).** The whole graph as a force layout with `d3-force`, pan and zoom with `d3-zoom` (0.2 to 3 times; the picture is fitted to the stage below the caption and above the legend, again on every resize until it has been moved), and node dragging with `d3-drag` (a node is held where the pointer is while the rest follows, and a press that moves less than 4 px is still a click). Songs are records with their covers, the same glyph as the orbit's, and people are discs ringed by their roles, sized by song count (3 + 2 per song, 20 at most); links are coloured by the person's main role on the song. Names are drawn **at 12 px on the screen at any zoom** (their size is divided by the zoom): songs always, connectors once the picture is half size or more, anyone else while a neighbour is hovered or focused. A name that would be drawn over a more important one (the focused node, then songs, then larger people) is left out until there is room, in both renderers; the tooltip and the accessible name still give it. Hovering or focusing a node lights it and its neighbours and steps the rest back, with the same tooltip as the orbit; clicking, or Enter or Space, opens the orbit on that node. The forces are the prototype's: songs push (-620) and keep 28 px of room beyond their radius, people push (-150) with 20, links are 70 plus 3 per unit of the person's radius, and a weak pull to the middle (stronger for nodes with no link yet). **SVG up to 60 nodes, a canvas above (the threshold is measured, below)**: the canvas is the M3 renderer re-styled to the tokens (`drawGraph`, a quadtree hit test, `GraphLayout` in a Web Worker above 500 nodes, NFR-PERF-03), drawing the same records and discs. In SVG every node is a focusable button; on the canvas nodes are not individually focusable, and the connector cards, the liner notes, the find box and the Text view reach everything. Both renderers read one `LayoutController`, so a tick is a write to a map and a paint call, never a React render. With reduced motion the layout is worked out to rest (300 steps, in the worker too) before it is first drawn.

*Constellation threshold (measured in pull request 4).* Each frame moves every node of a graph of N nodes (a tenth of them songs, a link and a label for the usual fraction) and is timed from one animation frame to the next, in the app's own browser pane on the developer's machine (a 144 Hz display, so 6.9 ms is the best a frame can be). SVG elements with a `transform` written per frame, against a 2D canvas redrawn per frame:

| N | SVG ms per frame | canvas ms per frame |
| --- | --- | --- |
| 50 | 9 to 23 | not measured |
| 80 | 13 to 60 | not measured |
| 100 | 17 to 114 | 6.9 |
| 150 | 70 | not measured |
| 250 | 165 | 6.9 |
| 500 | 600 | 6.9 |
| 1000 | 783 | 7.9 (p95 14) |

The SVG figures vary a lot from run to run (a range is several runs, a single figure one run); the canvas figures hardly do. SVG held 30 frames a second only up to about 80 nodes, so the threshold is **60**, not the 250 the first plan guessed. A graph that is in SVG is moving only while it settles (a few seconds after a change) and while a node is dragged. The measurement is a stress case: it moves every node on every frame, as a settling layout does, and nothing else was running.

**Right column.**

- **The column scrolls on its own** (from 900 px up) and its two headings, "Connectors" and "Liner notes", stick to its top on an opaque background, so a card slides under the heading instead of being cut off at the container's edge; the next heading replaces the first when its section arrives.
- **Connector cards (FR-HUB-02).** One card for each person credited on two or more songs, most songs first, then by name: an avatar with a ring of role segments, the song count (counting up when it changes), the name in capitals, a bar of role colours with the roles in `aria-label`, and the small sleeves of their songs. A new connector rises in; when counts change the cards **FLIP** to their new order. Clicking a card puts that person at the centre of the orbit.
- **Liner notes (FR-NOTES-01, FR-GRAPH-04).** One card for each song in the order added, the streaming song first while it loads: sleeve, title, "artist · year · album", a status chip (`complete`, `partial`, `none`, `loading`, decision 0015), and, when it has neither a producer nor a songwriter, the "credits incomplete" badge with the link to MusicBrainz. Below it, one row per role: a colour bar, the role's name ("Produced by", "Written by", "Mixed by", "Engineered by", "Played by", "Vocals", "Also credited"), and the names, each a button that centres that person, with `×n` for connectors and the detail in brackets. A name that has just arrived is highlighted for 1.6 s. Each card has "Remove from graph" (FR-GRAPH-01, FR-GRAPH-06). Clicking the card's head puts the song at the centre.
- **Removing a song (FR-GRAPH-06).** The card leaves with an exit animation, the song's record folds into the orbit and fades, and the people credited only on that song leave with it (they are derived from the songs that remain). A bar says "Removed “Redbone” from your graph" with **Undo** for six seconds. The `DELETE` is sent when the six seconds are up, so an undo is nothing to take back and the server never sees the removal; closing the page inside the six seconds leaves the song in the graph (the safe failure), and leaving the workspace sends it at once. Several songs removed in a row each keep their own six seconds; the bar offers undo for the latest.
- **Hide from view (FR-VIEW-03).** "Hide from view" is a button on the caption of the orbit when a person is the centre, on a connector card and on a row of the Text view's people table (never on a node, so a click on a node still means "put this at the centre"). A hidden person is out of every view, the cards and the counts until shown, but their credits are still the song's credits: the status chips and the "credits incomplete" badge are judged from every credit. The state is kept for the browser session (`sessionStorage`, per graph) and never sent anywhere. A chip in the strip says "n hidden · show" and opens a menu to show everyone or one person. If the centre is hidden, the orbit returns to the last centre before it.
- **Text view (NFR-A11Y-01).** A toggle in the liner-notes header swaps the cards for M3's tables (songs with their credits, and people with song counts and connector marks), which carry exactly the data the orbit and constellation draw, with the same filters and the same hidden people. The people table lists connectors first and then "Show all n people", which lists the rest 100 at a time, so 50 songs and 700 or more people stay fast. It is also where "+N more" leads, and it carries "Remove from graph" and "Hide from view" for every row, so nothing is only reachable from a drawing.

**Phones (below 900 px).** The workspace stacks, as the prototype does: the stage is 70% of the viewport height (at least 460 px), the connector cards and liner notes follow in one column, the legend chips wrap along the bottom of the stage, and the search sheet is full width. The breadcrumbs take the full width above the stage.

*Phone check (M3R pull request 5; 390 × 844, in the app's browser pane against four songs and 19 people).* Every view (landing with results, the add sheet, the orbit, the constellation, and the workspace with the Text view open) has no horizontal overflow. Controls meet WCAG 2.2's target size (2.5.8: 24 × 24 CSS px, or spaced so that a 24 px circle on them touches no other control); a few small controls pass by spacing (the brand link at 22 px, the role chips at 20 px). **The orbit's nodes are 10 px discs on a phone, and each has a hit area of at least 24 px across** (section 12, OrbitView). The check found three real problems. Names in the liner notes that wrapped onto lines 22 px apart are now 24 px tall (a test pins it). The app bar, which is up to four rows on a phone (brand, links, find, view toggle), was sticky and kept about a third of the screen: it is sticky from 900 px up and scrolls away below it. And the orbit's second-ring nodes were a few pixels apart: they now have the hit areas described there.

### Motion (NFR-MOTION-01)

The animations are: the staggered rise of lists, the "match" meter's bars, the add button's pop, the versions disclosure, the FLIP reorder of connector cards, the count-up of counts, the highlight of a new credit, the streaming bloom, the orbit's polar transitions, the exit of a removed song and its undo, and the constellation's settling. The prototype's animations are ticked off in the pull request that delivers each (the checklist is in the pull request body), and every one is in the app as of the fourth pull request: headline word-drop, landing record rotation, results stagger with the meter's bars, add pop and versions expand (pull request 2); orbit re-root transition, streaming bloom, focus mode with tooltip, connector ripple, role arcs drawing in, "Now spinning" swap and the live "Credits loaded" chip, exit and undo of a removed song (pull request 3); connector FLIP reorder with count-up, new-credit flash and rising role rows, constellation drag and zoom (pull request 4). Rules:

- Each respects `prefers-reduced-motion`, and follows a change of the setting made while the page is open (`useReducedMotion` listens to the media query). With it set, an animation is replaced by its end state: counts jump, lists appear, the constellation is laid out to rest before it is first drawn, and the record illustration and the live indicator are still.
- CSS animations and transitions on elements change only `transform` and `opacity` (so the versions disclosure reveals its container at once and rises its rows). The SVG views are the exception that is stated: one `d3-timer` loop writes `transform` and path attributes per frame, which repaints SVG and does not lay out the page.
- The orbit's loop runs only while something moves; a graph at rest costs no frames (as the M3 canvas does).
- An animation never carries the only copy of a fact: counts are text, new credits are also in the live status line, and status is a word.
- **A baseline, and a test of the app's own rules (M3R pull request 5).** The theme's global styles end every CSS animation and transition at once (`0.01ms`, one iteration) when `prefers-reduced-motion: reduce` is set, so MUI's own motion (button states, the autocomplete, the sheet) is covered; a progress bar (`role="progressbar"`) is excluded because its movement is the information that something is loading. Beyond the baseline the app's own animations are declared only inside `prefers-reduced-motion: no-preference`, and a test reads the stylesheet of the landing page, the results, the orbit with its cards and notes, and the constellation and fails on any rule of the app's own that declares an animation or a transition outside such a block (`web/src/motion/motionCss.test.tsx`). The motion that is not CSS (the orbit's timer, the constellation's layout, the FLIP slide, the count-up, the exit of a removed song, the new-credit highlight) is replaced by its end state by its own code, each with a test.

### D3 modules

Only what is used is imported, in the lazy chunk of the workspace: `d3-hierarchy` (tree), `d3-shape` (`linkRadial`, `arc`, `pie`), `d3-force`, `d3-zoom`, `d3-drag`, `d3-selection`, `d3-scale`, `d3-ease`, `d3-timer`, `d3-quadtree`. The landing page imports none of them.

| Component | D3 modules | Behaviour |
| --- | --- | --- |
| `OrbitView` | `d3-hierarchy`, `d3-shape`, `d3-ease`, `d3-timer`, `d3-zoom` | Radial tree, role arcs, polar transitions, re-rooting |
| `ConstellationView` | `d3-force`, `d3-zoom`, `d3-drag`, `d3-quadtree` (canvas) | Whole-graph overview; SVG, and canvas above the threshold |
| `Text view` | none | Accessible tables of the same data (NFR-A11Y-01) |
| `ConnectorCards` | `d3-scale` (counts) | Cards, FLIP reorder, count-up |
| `CareerTimeline` (v3) | `d3-scale`, `d3-axis`, `d3-time` | Credits per year for a person |
| `StudioMap` (v3) | `d3-geo` | Recording locations on a world map |
| `FamilyTree` (v3) | `d3-hierarchy` | Covers, samples and remixes |

### Performance budgets

- JavaScript under 250 KB gzipped on first load; D3 visualisations load lazily. "First load" means the scripts `index.html` loads or preloads. Lazy route chunks and the OpenTelemetry web SDK, which loads after first paint, are reported separately and do not count (decision 0002). CI enforces the 250 KB limit on first-load scripts and prints the full table on each run.
- Fonts are not JavaScript, but they cost the first paint if they are declared up front: no more than about 130 KB of woff2 for the two latin subsets, requested after the first paint, `font-display: swap`, and the page keeps a cumulative layout shift under 0.1 when they swap in. Lighthouse stays at 90 or better and the largest contentful paint under 2.5 s.
- Lighthouse performance score at least 90 on the home page, checked in CI (the `lighthouse` job: `@lhci/cli` 0.15.1 against the production build, three runs, mobile profile, `web/lighthouserc.json`). The page is the landing page from the first refresh pull request.
- Measured in M3, kept as the baseline: first load about 185 KB gzipped; the graph view chunk about 42 KB with D3 and the SignalR client 14 KB, both lazy; for 600 nodes a simulation step took 2.4 ms and a canvas frame 0.4 ms, and with the layout in the worker the page's thread was never late by more than 2 ms. On GitHub's runner the Lighthouse runs scored 85, 97 and 97 (median 97) with a largest contentful paint of 2.1 s on the mobile profile (NFR-PERF-04 asks for under 2.5 s). A phone's frame rate (NFR-PERF-03's 30 fps) was not measured and still is not.
- Measured in M3R pull request 1 (the M3 home page with the new theme and fonts, local, mobile profile, three runs): first-load JavaScript 185.7 KB gzipped (up 0.9 KB); the two latin font files are 90 KB and 40 KB of woff2, and only the display font is on the first paint's path. Lighthouse performance 0.94 (runs of 0.90, 0.94 and 0.94), but the **largest contentful paint rose from 2.1 s to 2.6 s** (NFR-PERF-04 asks for under 2.5 s) and first contentful paint from 2.0 s to 2.5 s: the 90 KB width-axis font costs about half a second on the simulated slow 4G, and preloading it made no difference to the simulation. Measured on the landing page in M3R pull request 2 (same method): declaring the fonts up front, even as `font-display: optional`, keeps the largest contentful paint at 2.6 s, and with no web font it is 2.1 s; requesting them after the first paint gives **2.3 s** with performance 0.97. That first attempt shifted the page by 0.124 (the header wrapped differently once the font's widths arrived); putting the navigation on a row of its own on a phone brought the shift to 0.018. First-load JavaScript on the landing page is 166.8 KB, because the graph, the results list and the sheet are lazy chunks.
- Measured in M3R pull request 3 (the workspace, production build): first-load JavaScript **167.8 KB** gzipped (the landing page's 166.8 KB plus 1 KB of router code); the `GraphView` chunk, which holds the orbit, the cards, the notes and the D3 modules they use, is **50.7 KB** gzipped (the M3 canvas view was 42 KB), with the SignalR client (14 KB) and the OpenTelemetry SDK (23 KB) still separate and lazy. For 50 songs and 701 people (a person on every song), building the `Workspace` took 12 ms on a cold start and laying out the orbit's 112 nodes took 1.8 ms (Node, in a test). The orbit's frame time in a browser and a phone's frame rate (NFR-PERF-03) are **not** measured: the embedded browser used for development pauses animation frames between commands, so a number from it would be wrong. To be measured in M3R: the largest constellation that stays within NFR-PERF-03 as SVG, which sets the threshold (pull request 4).
- Measured in M3R pull request 4 (the overview, production build): first-load JavaScript **169.5 KB** gzipped (the shell gained the header slot and the find and toggle controls render only in the lazy workspace chunk); the `GraphView` lazy chunk is **88.3 KB** (it holds MUI's Autocomplete and toggle group, the liner notes and the orbit) and the **`ConstellationView` chunk 17.0 KB**, loaded only when the constellation is first shown, plus the **layout worker 17.4 KB**, loaded only above 500 nodes. The constellation threshold measurement is in section 12.

## 13. Testing, CI/CD and deployment

Every acceptance criterion in section 3 maps to at least one automated test, and no test ever calls the real MusicBrainz API: a WireMock.Net fake serves recorded responses instead.

### Test layers

| Layer | Tools | What it covers | Runs |
| --- | --- | --- | --- |
| Backend unit | xUnit, AwesomeAssertions | Role mapping, recommendation scoring, path search, dedup logic | Every push |
| Backend integration | xUnit, Testcontainers (PostgreSQL, Redis), WireMock.Net | Endpoints, EF Core queries, crawl worker, rate gate, retries | Every push |
| Contract | OpenAPI diff | Breaking API changes fail the build unless the version changes | Every pull request |
| Frontend unit | Vitest, React Testing Library, MSW | Components, stores, SignalR cache updates | Every push |
| End to end | Playwright | M3R: one browser flow (search, add, orbit, remove) against the production build with the Api and the hub faked at the network edge (`web/e2e`). M4: US-01 to US-03 and US-08 happy paths against the Aspire stack with a recorded MusicBrainz, and accessibility checks with axe | Every pull request |
| Load | k6 | Search and cached graph endpoints against NFR-PERF targets | Nightly and before release |

Test naming carries the requirement ID, for example `FR_GRAPH_03_credits_from_work_are_attached_to_recording`, so a search for an ID finds its tests.

How the layers run in practice (M1):

- Backend tests use **xUnit v3**, which needs `global.json` to opt in to the Microsoft Testing Platform (`"test": { "runner": "Microsoft.Testing.Platform" }`) on the .NET 10 SDK. `dotnet test` from the repository root runs every project.
- Integration tests start a real PostgreSQL 18 container with Testcontainers, so **Docker must be running**. One container is shared by each test project (an xUnit assembly fixture) and every test gets its own database.
- MusicBrainz is never called by tests. WireMock.Net serves real responses captured once from MusicBrainz at no more than 1 request per second (`tests/Nodeable.Infrastructure.Tests/Fixtures/musicbrainz`, with a README listing each request); the rate gate tests run its Lua script on a real Redis container, with two connections standing in for two service instances.
- Frontend tests use Vitest with MSW: the real client and components run against a fake Api, and any request without a matching handler fails the test.
- Backend assertions use **AwesomeAssertions**, a free fork of FluentAssertions 7 with the same `.Should()` syntax; FluentAssertions 8 and later is commercially licensed (decision 0012). The package was added in M2 (decision 0012) and every backend test project uses it.

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
  tools/ci/                        CI helper scripts (coverage gate)
```

### CI pipeline (GitHub Actions)

1. Restore, build and lint backend and frontend in parallel.
2. Run unit and integration tests; publish coverage and fail under 80% on `Domain`.
3. Generate the OpenAPI document and diff it against `main`.
4. Build Docker images for Api, Worker and Web; scan them for vulnerabilities.
5. Run Playwright end-to-end tests against the composed stack.
6. On `main`, push images to GitHub Container Registry and deploy.

Implemented in M1 (`.github/workflows/ci.yml`, four parallel jobs): **backend** (restore, Release build with warnings as errors, `dotnet format --verify-no-changes`, tests, NuGet vulnerability check), **web** (`npm ci`, typecheck, ESLint, tests, build, the 250 KB first-load budget, `npm audit`), **api-contract** (regenerate `web/src/api/schema.d.ts` and fail on any difference) and **learning-tools** (anchor script tests and `--check`). The backend job also gates `Domain` at 80% line coverage (added in M2, when `Domain` got its first logic): the Domain tests run with a Cobertura report and `tools/ci/check-coverage.mjs` fails the build under the minimum or when the assembly is missing from the report. Added in M3R: **lighthouse** (the landing page's performance score, three runs) and **e2e** (the browser flow of `web/e2e`, with Chromium installed by Playwright; the Api and the hub are faked at the network edge, so it needs no database and never reaches MusicBrainz). Not yet in place: the OpenAPI diff against `main`, image build and scanning, the Playwright suite against the whole stack, and the deploy step (M4).

### Deployment

- **Local:** `dotnet run --project src/Nodeable.AppHost` starts PostgreSQL, Redis, Api, Worker, the Vite dev server and the Aspire dashboard together. Docker must be running. The dashboard is at `http://localhost:15180` and the web app at `http://localhost:5173`: the AppHost fixes the proxy's port at 5173, so a bookmark keeps working (Vite itself is given another port by Aspire). Running `npm run dev` on its own serves the web app on port 5173 and proxies `/api` to the Api's launch-profile port 5029. PostgreSQL keeps its data in a named Docker volume (`nodeable-postgres-data`) with its generated password remembered in the AppHost's user secrets, so graphs and crawled data survive a restart; `node tools/dev/reset-local-db.mjs --yes` resets it (decision 0011).
- **Production:** one small VPS provisioned by Terraform, running Docker Compose with Caddy for HTTPS, Api, Worker, Web (static files served by Caddy), PostgreSQL, Redis and the OpenTelemetry Collector.
- **Releases:** images tagged by commit SHA; deploys pull new images and restart with health checks; EF Core migrations run as a separate one-off step before the Api starts.
- **Content-Security-Policy:** the app sets none today (neither the Api, Vite nor any file in the repository). When Caddy is configured in M4, a policy is added and its `img-src` must allow the album art hosts: `'self' data: https://coverartarchive.org https://archive.org https://*.archive.org https://cdn-images.dzcdn.net` (the data nodes are `dn<digits>.<country>.archive.org`, so a wildcard is needed; each hop of a redirect is checked). `font-src 'self'` is enough because the fonts are self-hosted, and `connect-src` needs the same origin, including its `wss:` address for the hub.
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
- [x] GitHub Actions: build, test, lint for both halves
- [x] OpenTelemetry wired in Api, Worker and the browser; one trace visible end to end

### M2 Ingestion (3 weeks)

- [x] MusicBrainz client with User-Agent and typed responses (FR-SEARCH-01)
- [x] Redis token-bucket rate gate shared by all instances (NFR-RATE-01)
- [x] Resilience pipeline for 503 and 429 with backoff and jitter (NFR-RATE-03)
- [x] `crawl_jobs` queue with `SKIP LOCKED` claiming and trace context propagation (NFR-REL-01)
- [x] Role mapping and credit upserts for recording, work and release levels (FR-GRAPH-03)
- [x] Integration tests with Testcontainers and WireMock.Net recordings
- [x] Store partial MusicBrainz dates with a precision column (decision 0008)
- [x] The Api queues only the recording job; the Worker queues the work, release and preview jobs (decision 0009; the preview job is queued from M4, behind a switch, see section 10)
- [x] Add AwesomeAssertions to the backend test projects (decision 0012)

### M3 Graph UI (3 weeks)

- [x] Search box with duplicate collapsing (FR-SEARCH-01, FR-SEARCH-02)
- [x] Graph endpoints and SignalR hub with `seq` ordering (FR-GRAPH-01, FR-GRAPH-02)
- [x] D3 canvas graph with zoom, hover, click and enter animations (FR-HUB-01)
- [x] Accessible list view of the same graph (NFR-A11Y-01)
- [x] Your hubs panel and role filters (FR-HUB-02, FR-HUB-03)
- [x] Credits incomplete badge (FR-GRAPH-04)
- [x] Neutral style and filter chip for the `other` role (decision 0010)
- [x] Lighthouse performance check in CI, 90 or better on the home page (spec section 12)
- [x] Persistent local database: data volume and remembered password, with a documented reset (decision 0011)

### M3R UI refresh (approved 2026-10-13, 1 to 2 weeks)

Design: `docs/design/nodeable-ui-prototype.html`, decision 0020. Pull requests in this order, each naming its requirement IDs and merged on green. Tag `v0.3.1` when the last is done.

- [x] Theme and tokens, self-hosted fonts, role colour and icon map, `Sleeve` and `AlbumArt` with the fallback chain, and the `releases` migration with the `release-groups` include (FR-ART-01, NFR-A11Y-02)
- [x] Landing page and search sheet with results and version-expand animation, and `kind` on results derived from MusicBrainz data first (FR-LAND-01, FR-SEARCH-01, FR-SEARCH-02, NFR-MOTION-01)
Reordered after the first screens were reviewed (2026-10-13): the `/graph` page is replaced in **one** pull request that matches the prototype, so the page never shows half of the old design and half of the new.

- [x] **Pull request 3, the workspace.** The whole `/graph` page: OrbitView centred on the whole graph by default (FR-VIEW-04) and fitted to the stage, with re-rooting, breadcrumbs that always start at "Your graph", the role filter bar, a large cover for a song with no credits, role arcs, tooltip, focus mode, the connector ripple, the "Now spinning" caption and the streaming bloom from SignalR events; the strip (headline and counts); the legend chips as role filters; the connector cards and the liner notes with the credits status and the credits incomplete badge; "Remove from graph" with an exit animation and undo; "Hide from view" with its chip; the Text view (connectors first, paginated people); `/graph?view=…&focus=…` address state; the M3 canvas page, left panel, details panel and tables removed; the one Playwright flow (search, add, orbit, remove), run in CI (FR-VIEW-01, FR-VIEW-03, FR-VIEW-04, FR-GRAPH-01, FR-GRAPH-02, FR-GRAPH-04, FR-GRAPH-06, FR-HUB-01, FR-HUB-02, FR-HUB-03, FR-NOTES-01, NFR-A11Y-01, NFR-MOTION-01)
- [x] **Pull request 4, the overview.** ConstellationView (SVG up to 60 nodes, canvas above, one layout controller, drag, zoom, neighbour lighting) and the Orbit / Constellation toggle (`?view=`); "Find in your graph"; the connector cards' FLIP reorder and count-up; the new-credit highlight and rising role rows in the liner notes; names that wrap at a word before they are cut, sit outside the role arcs, and show whole on hover and focus; the "n songs not connected · Your graph" chip (FR-VIEW-02, FR-VIEW-04, FR-GRAPH-05, FR-HUB-02, FR-NOTES-01, FR-GRAPH-02, NFR-MOTION-01, NFR-PERF-03)
- [x] **Pull request 5, the pass.** Reduced-motion pass over every animation (a baseline in the theme for MUI's own motion, the app's own rules guarded and scanned by a test, tests for the count-up and the exit of a removed song), the phone check at 390 px (three failures fixed: liner-note names, the sticky app bar, and 24 px hit areas on the orbit nodes, section 12), and the M3 canvas code the constellation does not reuse removed (`deriveGraph`, `filterCredits`, `hubsOf`, `hasIncompleteCredits`; the force layout, the canvas drawing, the hit test and the worker are the constellation's) (NFR-A11Y-01, NFR-MOTION-01)
- [x] **Pull request 6, the guide.** LEARN anchors checked (15 for LG-03R), the learning guide LG-03R drafted (sections 1 to 4 written and checked against the code; 5 to 12 outlined for the developer to write), spec updates; `v0.3.1` is tagged on the merge commit of this pull request and the Learning guides workflow attaches the PDF (spec section 16)

### M4 Discovery and launch (2 weeks)

- [ ] Person drawer with credited recordings (FR-PERSON-01)
- [ ] Recommendation scoring with reasons (FR-REC-01, FR-REC-02)
- [x] Deezer previews by ISRC (FR-PREVIEW-01), including turning on `Ingestion:QueuePreviewJobs` with the handler (M4 pull request 1, decision 0025). The preview is looked up and stored and `GET /recordings/{mbid}/preview` answers; playing it in the app is the next task
- [ ] Before the preview work starts, re-check that the preview audio host still sends `Access-Control-Allow-Origin` (decision 0022); then the waveform player: fetch and decode in the browser, peaks drawn with D3 with a playhead, seeking, the spinning record, reduced motion, and the player working without a waveform (FR-WAVE-01, FR-PREVIEW-01, NFR-MOTION-01, NFR-A11Y-01)
- [ ] The 30-day refresh (NFR-REL-03), which is specified but not built: a scheduled job (Hangfire, section 7) at the scheduled priority that refetches stored recordings, works, releases and people whose `fetched_at` is over 30 days old through the same crawl queue and rate gate, at random times across the day (section 10, constraints), and so also fills what rows fetched earlier lack (the `releases` release-group columns of M3R); `cache.lookups` counts `stale`, and a test shows a refresh changes nothing when MusicBrainz has not
- [ ] About page with architecture and live crawl status (FR-ABOUT-01)
- [ ] Grafana dashboards and SLO alerts (section 11)
- [ ] Terraform VPS, Caddy, Docker Compose deploy; seed the demo cache
- [ ] Playwright suite green (extending the one flow added in M3R); k6 confirms NFR-PERF-01 and 02

### v2 and v3

Break v2 and v3 into tasks at the MVP retrospective, using the requirement tables in section 4 as the backlog.

Approved 2026-10-14 (nothing is started; these join the backlog, in this order inside their phase):

- [ ] **v2, gate: the privacy notice** (NFR-PRIV-02) is written and published before FR-AUTH-01 ships, because an account stores an email address
- [ ] **v2, FR-CREDIT-USER-01:** `user_credits` and its migration, add / list / delete endpoints, the person picker (stored people, then MusicBrainz artist search), the "Added by you" label in the orbit, liner notes and Text view, `origin` in the snapshot and its generated types, and tests that a MusicBrainz refresh keeps user credits (NFR-SEC-05, NFR-LIC-01, decision 0021)
- [ ] **v2, FR-CREDIT-REVIEW-01:** the `admin` role, the submit flow with the CC0 terms and the daily limit, the review queue and its decisions with reasons, `credit_review_events`, the "Community" label, the supersede step in the refresh, the "Submit to MusicBrainz" link, and the queue's metrics (section 11)
- [ ] **v3, FR-CREDIT-VOTE-01:** only when the active-user gate in section 4 is met; `credit_votes`, trust level, sampling of auto-approved credits
- [ ] **v3, FR-WAVE-02:** first settle Deezer's terms and choose the decoder and algorithms (section 15); then the `analysis` job kind, `preview_analysis`, the analysis endpoint, the three-band waveform and the BPM text, and a static waveform with reduced motion

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

Raised while building M1 and decided on 2026-10-11 (each has a decision record, a row in the log below, and a task in the milestone that implements it):

- [x] **Partial dates.** A date plus a precision column (`year`, `month`, `day`). Decision 0008, implemented in M2.
- [x] **Which jobs the Api queues.** The Api queues only the recording job; the Worker queues the work, release and preview jobs, and `pendingJobs` starts at 1 and grows. Decision 0009, implemented in M2.
- [x] **How the `other` role looks.** Neutral grey with a generic icon, labelled from `detail`, with its own filter chip; promote common types to real roles later with real data. Decision 0010, implemented in M3.
- [x] **Persistent local database.** A Docker data volume with the password remembered in user secrets and a documented reset; fall back to an ephemeral database plus a seed script if Aspire cannot remember the password. Decision 0011, implemented in M3.
- [x] **Assertion library.** AwesomeAssertions. Decision 0012, added in M2.
- [x] **ESLint 10 and TypeScript 7.** ESLint moved to 10 with the `eslint-plugin-jsx-a11y-x` fork at the start of M2 (decision 0014). TypeScript stays on 6.0, with Dependabot ignoring its major and minor updates and a check at the start of each milestone (decision 0013).

Raised on 2026-10-14 with the community-credit and waveform proposals (decisions 0021 and 0022, approved the same day; the unchecked ones stay open):

- [ ] **Free-text people.** Should a person be able to credit someone who has no MusicBrainz entry (a name only)? Approved for now: an MBID is required (decision 0021), because a name-only credit cannot be matched, merged or superseded. This stays open.
- [x] **The daily submission limit.** 10 a day, a configuration value. Approved 2026-10-14.
- [ ] **The privacy notice's text** and whether the CC0 dedication and the account-deletion rules in NFR-PRIV-02 need a legal reading before v2. This spec is a design, not legal advice.
- [ ] **One reviewer.** The `admin` is the developer; what happens to the queue when they are away (a time limit after which a credit stays `submitted`, with no automatic approval, is the proposal)?
- [ ] **Deezer's terms for analysis.** May a preview be fetched by the Worker, analysed and the derived values (band peaks, tempo, key) stored? Not read yet; settled before FR-WAVE-02.
- [ ] **Which decoder and algorithms** for FR-WAVE-02 in .NET (an MP3 decoder, tempo and key estimation), chosen and tested against known-tempo recordings when v3 starts.
- [x] **The active-user gate** for FR-CREDIT-VOTE-01: 100 signed-in users active in 30 days. Approved 2026-10-14; may be revisited at the v2 retrospective.
- [x] **The 30-day refresh (NFR-REL-03)** is specified but was not built; it is a task in M4 (section 14).

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
| 2026-10-11 | Partial MusicBrainz dates are stored as the earliest possible day plus a `year`, `month` or `day` precision ([0008](decisions/0008-partial-dates-keep-their-precision.md)) | Principle 5: a year-only date must not be shown as a precise day, while ordering stays simple |
| 2026-10-11 | The Api queues only the recording job; the Worker queues the work, release and preview jobs, and `pendingJobs` starts at 1 ([0009](decisions/0009-api-queues-only-the-recording-job.md)) | The work and release IDs and the ISRC are only known from the recording response, and the release step is conditional |
| 2026-10-11 | The `other` role is shown in neutral grey with a generic icon, labelled from `detail`, with its own filter chip ([0010](decisions/0010-other-role-is-shown-neutrally.md)) | Principle 5: incomplete data is shown, never hidden; promote common types once there is real data |
| 2026-10-11 | From M3 the local PostgreSQL uses a data volume with its password remembered in user secrets, with a documented reset ([0011](decisions/0011-persistent-local-database.md)) | Re-fetching at one request per second makes losing the cache on every restart expensive; falls back to a seed script if the password cannot be remembered |
| 2026-10-11 | Backend assertions use AwesomeAssertions, not FluentAssertions ([0012](decisions/0012-awesomeassertions.md)) | Same syntax, Apache-2.0 licence, no commercial-licence question for a portfolio project |
| 2026-10-11 | Hold ESLint at 9 and TypeScript at 6.0; keep `@types/node` on the runtime's major (24); Dependabot ignores those majors; review at each milestone start ([0013](decisions/0013-hold-eslint-and-typescript-majors.md)) | The accessibility plugin and typescript-eslint do not support newer majors yet, and the Node types must match the Node runtime; upgrades should be deliberate |
| 2026-10-11 | Move to ESLint 10 and replace the accessibility plugin with the maintained fork `eslint-plugin-jsx-a11y-x`; supersedes the ESLint part of 0013 ([0014](decisions/0014-eslint-10-and-jsx-a11y-x.md)) | ESLint 9 reached end of life on 2026-08-06 and `eslint-plugin-jsx-a11y` has not been released since 2024-10-26; the fork has identical recommended rules and a regression test guards it |
| 2026-10-12 | A recording's credits status is derived from the roles credited: complete (producer and songwriter), partial (something), none ([0015](decisions/0015-credits-status-rule.md)) | Section 8 listed the values but not their meaning; FR-GRAPH-04 and the cache decision both depend on it |
| 2026-10-12 | MusicBrainz requests go through a Redis token bucket placed inside the retry, replacing the default resilience handler ([0016](decisions/0016-musicbrainz-request-pipeline.md)) | A retry is a new request and must wait for its own slot; N Workers must share one budget |
| 2026-10-12 | The crawl queue is a PostgreSQL table claimed with SKIP LOCKED, with guarded updates and stale-job recovery ([0017](decisions/0017-crawl-queue-on-postgresql.md)) | Reliability without a broker at one request per second; inspectable with SQL |
| 2026-10-12 | The Api asks MusicBrainz for searches itself, through the shared Redis gate with a 2 second wait cap and one retry; every other fetch stays in the Worker ([0018](decisions/0018-search-calls-musicbrainz-from-the-api.md)) | A search has to answer in the same request; the gate is already shared, so the limit still holds across processes |
| 2026-10-13 | UI refresh: orbit and constellation replace the force canvas; album art from the Cover Art Archive with fallbacks; motion rules ([0020](decisions/0020-ui-refresh-orbit-and-constellation.md)) | The M3 canvas is unreadable at 50 songs; the developer designed a replacement as a prototype (approved 2026-10-13) |
| 2026-10-13 | The `/graph` page switches over in one pull request; removal is undoable (FR-GRAPH-06); people can be hidden from the views (FR-VIEW-03); the pinned local port 5173 ([0020](decisions/0020-ui-refresh-orbit-and-constellation.md), "Changes after the first screens were reviewed") | The developer reviewed the first refresh screens and reordered the rest |
| 2026-10-13 | The orbit is centred on the whole graph by default (FR-VIEW-04) and fitted to the stage; a role filter is said out loud (FR-HUB-03); a song with no credits shows its cover large ([0020](decisions/0020-ui-refresh-orbit-and-constellation.md), "Changes after the workspace was reviewed") | The developer reviewed the workspace with two unrelated songs |
| 2026-10-13 | The constellation is SVG up to 60 nodes and a canvas above (measured, not the 250 first guessed); the toggle and find sit in the app bar through a portal; names wrap at a word before they are cut ([0020](decisions/0020-ui-refresh-orbit-and-constellation.md), "Changes after the overview was built") | The measurement the decision asked for; the developer's review of the workspace |
| 2026-10-12 | A song is added by MBID only; the Api confirms an unknown recording with MusicBrainz and a hub join carries the token as an argument ([0019](decisions/0019-add-by-mbid-and-hub-token-argument.md)) | The shared cache must not accept client-supplied titles; a WebSocket cannot send a header and a URL token reaches logs |
| 2026-10-14 | The developer approved the constellation's canvas threshold of **60** nodes ([0020](decisions/0020-ui-refresh-orbit-and-constellation.md), "Changes after the overview was built") | The measurement the decision asked for; pull request 4 was merged |
| 2026-10-14 | Community credits are stored apart from MusicBrainz's, reviewed by an admin before anyone else sees them, and released as CC0 (FR-CREDIT-USER-01, FR-CREDIT-REVIEW-01 in v2; FR-CREDIT-VOTE-01 in v3) ([0021](decisions/0021-community-credits-data-model-and-licensing.md)) | Sparse credits are the spec's biggest data risk; MusicBrainz's core data is CC0, so a CC0 contribution has the same terms; mixing the tables would lose the licence boundary and expose MusicBrainz's idempotent upserts to user data |
| 2026-10-14 | The preview waveform is decoded in the browser because Deezer's preview audio sends `Access-Control-Allow-Origin: *`; nothing is stored for FR-WAVE-01, and FR-WAVE-02's analysis is the Worker's (v3) ([0022](decisions/0022-preview-waveform-is-decoded-in-the-browser.md)) | Checked on 2026-10-14; no new table or job in M4; the preview URL expires after about 15 minutes, so only the track id is stored |
| 2026-10-14 | **Stated, not changed:** every added recording and what it leads to is persisted and read before MusicBrainz is asked; search results nobody added are not stored (NFR-CACHE-01, section 10 "Persist, then reuse") | The developer asked for the rule to be explicit; it describes M2 and M3 as built, and notes that the 30-day refresh (NFR-REL-03) is not built yet |
| 2026-10-14 | Previews are matched by ISRC only; the recording stores its ISRCs and the preview its album image ID; the preview answer is `{ url, expiresAt }` with no duration, and Deezer's miss is an HTTP 200 the client reads from the body ([0025](decisions/0025-deezer-lookup-by-isrc.md)) | Checked against real responses on 2026-10-14; no second MusicBrainz request; a wrong-song preview is worse than none; a false `durationSeconds` would be the song's length, not the preview's |
| 2026-10-14 | The 30-day refresh (NFR-REL-03) is a task in M4; people need an MBID to be credited; search results stay unpersisted; the proposed numbers (10 submissions a day, 160 peaks, trust at 5 approved credits with none rejected in 90 days, a vote gate of 100 active users in 30 days) and the reduced-motion rule for FR-WAVE-01 are approved ([0021](decisions/0021-community-credits-data-model-and-licensing.md), [0022](decisions/0022-preview-waveform-is-decoded-in-the-browser.md)) | The developer reviewed the proposals; the spec must not promise a refresh that does not exist |

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
| 12. Check yourself | Ten short questions covering the guide, with the answers in a separate part so the developer can test themselves |

### Code anchors

Key places in the code carry a comment in a fixed format, so guides are built from the code rather than from memory:

```csharp
// LEARN: LG-02 rate-gate | Redis Lua script makes the token check and decrement atomic across instances
```

```ts
// LEARN: LG-03 signalr-cache | SignalR events write straight into the TanStack Query cache
```

A guide id is `LG-` and two digits, with an optional capital letter for a revision of a milestone (`LG-03R`, the M3 UI refresh; the tools accept the letter from M3R's first pull request). The script `tools/learning/collect-anchors` scans the repository for `LEARN:` comments and outputs the code map table (section 3) with file paths, line numbers and permalinks pinned to the release commit, so links never go stale.

### How the PDF is produced

1. At the end of a milestone, run `tools/learning/collect-anchors LG-02` to generate the code map.
2. Write the guide in Markdown from the template at `docs/learning/_template.md`. The AI coding assistant writes every section, 1 to 12, from the anchors, the diff and the decision records, and checks each technical claim against the code (file paths, test names, versions, numbers, links). The developer reviews the guide and learns from it, and answers the "Check yourself" questions without looking at the answers.
3. Run `tools/learning/build LG-02`, which uses Pandoc with syntax highlighting to render `docs/learning/pdf/LG-02-ingestion.pdf`. The build regenerates the code map between the `code-map` markers in section 3, sets `commit` and `release` in the front matter, and renders the HTML to PDF with WeasyPrint. Pandoc and WeasyPrint are installed on the CI runner, not on the developer's machine. Run it with `--write` once, when a guide is finalised, so the committed Markdown carries the same code map and commit as the PDF; it is not run on every commit, to keep diffs quiet.
4. The `learning-guides.yml` workflow rebuilds every guide: on each pull request that touches the guides or the tools, as an artifact (so the pipeline is exercised before any release), and when a `v*` tag is pushed, attaching the PDFs to that tag's GitHub release, so the published guides always match the published code.

### Guide plan

| Guide | After | Key concepts covered |
| --- | --- | --- |
| LG-01 Foundations | M1 | Aspire AppHost and service defaults, EF Core entities and migrations, Vite + TypeScript + MUI theme setup, generating API types from OpenAPI, OpenTelemetry wiring across browser and server |
| LG-02 Ingestion | M2 | Typed `HttpClient`, resilience pipelines, Redis token bucket with Lua, durable queue with `FOR UPDATE SKIP LOCKED`, trace context across background jobs, relationship-to-role mapping |
| LG-03 Graph UI | M3 | SignalR hubs, groups and the Redis backplane, sequence-numbered events and join-then-load, TanStack Query cache updates, Zustand stores, D3 force simulation on a canvas and in a Web Worker, quadtree hit testing, pg_trgm search, accessible tables |
| LG-03R UI refresh | M3R | Radial tree layout with `d3-hierarchy` and `linkRadial`, polar interpolation, FLIP reordering, reduced motion, an image fallback chain, SignalR events through the query cache into animation, SVG versus canvas above a threshold |
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
