# 0028. The 30-day refresh is an hourly Hangfire selection that queues ordinary crawl jobs

- **Status:** Accepted 2026-10-16. The developer approved the plan, including that a refresh removes credits MusicBrainz no longer returns, and the dashboard hosted by the Api in Development only.
- **Date:** 2026-10-16
- **Spec:** NFR-REL-03, NFR-CACHE-01, NFR-RATE-01, section 7 ("Flow: scheduled work"), section 10 (persist then reuse, constraints), section 11 (`cache.lookups`); decisions 0009, 0017, 0025 and the D4 answer of 2026-10-14

## Context

NFR-REL-03 says cached credits are refreshed when older than 30 days, in the background. Until now nothing did it: a stored row stayed as it was fetched. Three things made the design less obvious than "a timer that refetches old rows":

- MusicBrainz asks that background work is not sent in bursts or at fixed times (section 10), and every request must go through the one shared rate gate.
- The credit writer only inserted (`ON CONFLICT DO NOTHING`), so a refetch could add a credit MusicBrainz had gained but never remove one it had dropped. "The cache matches MusicBrainz" was half true.
- Recordings stored before M4 have no ISRC, so they have no preview, and nothing would ever fetch them again until they turned 30 days old.

## Decision

1. **Hangfire runs one recurring job, `cache-refresh`, every hour** (`Refresh:Cron`, default `7 * * * *`, UTC). It lives in the Worker, with Hangfire's storage in the `hangfire` schema of the same PostgreSQL database (`Hangfire.PostgreSql`).
2. **The job only selects; it never calls MusicBrainz.** It reads up to `Refresh:BatchPerRun` (20) stale rows, oldest first, from `recordings`, `works` and `releases` (`fetched_at` older than `Refresh:MaxAge`, 30 days) and queues one ordinary `crawl_jobs` row for each at the scheduled priority (10), through `ICrawlQueue`. The handlers, the retry rules, the trace context and the rate gate are the ones every other fetch uses, so an interactive request always goes first.
3. **Each queued fetch waits a random time** of up to `Refresh:MaxDelay` (50 minutes), so a run never sends its batch together. The queue gained an `EnqueueAsync` overload with a delay (`run_after = now() + delay`).
4. **A row already waiting in the queue, or whose fetch failed for good within the window, is skipped.** Without that the same few rows would fill every batch.
5. **People are not fetched one by one.** They have no lookup of their own; a person is rewritten whenever a recording, work or release they are credited on is fetched.
6. **A fetch makes the stored credits match MusicBrainz.** After inserting what the response has, the credit writer deletes the credits of that subject with `source = 'musicbrainz'` that the response no longer contains, in the same transaction. A credit from any other source (Discogs in v2, a person's own credits) is never touched. On a first fetch there is nothing to delete.
7. **ISRC backfill.** A recording stored before `Refresh:IsrcBackfillBefore` (2026-10-14, when ISRCs began to be stored) that has no ISRC counts as stale. Its refetch stores the ISRCs, and the recording job already queues the preview lookup (`Ingestion:QueuePreviewJobs`), so pre-M4 songs gain previews without any other code. A refetch rewrites `fetched_at`, so each row is backfilled once.
8. **`cache.lookups{result=stale}`** is counted per row selected, with the entity (`recording`, `work`, `release`).
9. **The dashboard is served by the Api, in Development only** (D4). The Worker has no web host, so the Api registers Hangfire as a client of the same storage and maps `/hangfire`; in any other environment the route does not exist. It opens no connection at startup (`PrepareSchemaIfNecessary = false`), because the Worker creates the schema. It is reached on the Api's own port, not through the web app's proxy.

## Alternatives considered

| Option | Why not |
| --- | --- |
| A `BackgroundService` with a timer, like the crawl loop | It would work, but D4 chose Hangfire for scheduled work (radar, rollup, SLO checks follow); this is the first recurring job and proves the setup |
| Hangfire jobs that call MusicBrainz themselves | A second path to the API would need its own retry and rate handling; going through the queue reuses all of it |
| One daily job that queues everything stale at random times | Needs a per-row random time stored; the hourly slice with a delay gives the same spreading with a stateless selection |
| Additive refresh (never remove credits) | Leaves wrong credits in the cache for ever; the developer chose removal |
| Hangfire dashboard in the Worker | The Worker is a generic host with no HTTP server; adding one only for a development page is more than hosting it where a web server already exists |

## Consequences

- With `BatchPerRun` 20 an hour, at most 480 refetches a day; a cache of a few hundred songs needs a fraction of that, and the cap bounds the traffic if the cache grows or a backfill is large.
- A recording refetch queues its work, release and preview jobs at the same scheduled priority (decision 0009), so one stale recording can cost a handful of requests, all through the gate.
- Removing credits makes a transient bad answer from MusicBrainz able to remove real credits until the next refresh. MusicBrainz errors fail the job before anything is written, so only a successful but incomplete answer can do it; this is accepted.
- `Hangfire.Core` depends on Newtonsoft.Json 11.0.1, which has an advisory; `Directory.Packages.props` pins 13.0.4.
- `Hangfire.PostgreSql` 1.21.1 was checked against Npgsql 10.0.3 (a job ran against the development database) before it was adopted.
