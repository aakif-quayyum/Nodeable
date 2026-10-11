# 0017. The crawl queue is a PostgreSQL table claimed with SKIP LOCKED

- **Status:** Accepted (implemented in M2, [pull request 15](https://github.com/aakif-quayyum/Nodeable/pull/15))
- **Date:** 2026-10-12
- **Spec:** NFR-REL-01, NFR-OBS-01, section 7 ("Flow: adding a song"), section 8 (`crawl_jobs`), decision 0009

## Context

Jobs must survive a restart of any service and resume (NFR-REL-01), carry the trace of the request that queued them, run highest priority first, and never be queued twice while outstanding. Throughput is bounded by MusicBrainz at one request per second, so the queue needs reliability, not speed.

## Decision

`crawl_jobs` is the queue; there is no broker.

- **Enqueue** is `INSERT ... ON CONFLICT DO NOTHING` against the partial unique index. If a person asks for something a background refresh already queued, the waiting job takes the higher priority; it is never lowered. The current W3C trace context is stored in `traceparent`.
- **Claim** is one statement: `UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING *`, highest priority first. Every comparison uses the database's clock.
- **Completing and failing are guarded by `locked_by`**, so a worker that was too slow cannot overwrite the claim of the worker that took its job over.
- **Retry of a whole job:** five attempts, 30 seconds doubling to a 15-minute cap, spread by 20% either way. A kind with no handler fails at once, and so does a handler that throws `CrawlJobPermanentFailureException`.
- **Shutdown** hands the running job back without counting the attempt. **A crash** leaves the job `running`; after ten minutes any worker puts it back, and recovery spends attempts too, so a job that keeps killing its worker ends up `failed`.
- **One job at a time per Worker.** More throughput comes from more Worker instances, and the rate gate bounds them.
- **The job's span is a child of the enqueuing span**, restored from `traceparent`, so a click and the background fetch it caused are one trace.

## Alternatives considered

| Option | Why it lost |
| --- | --- |
| Hangfire for every job | Hangfire is already planned for scheduled work (producer radar, refresh); using it for the interactive queue would put trace context, priority and per-kind deduplication in its serialised payload instead of columns the spec already defines |
| RabbitMQ or MassTransit | A second stateful service to run, secure and back up for one job type at one request per second |
| Redis lists or streams | Redis is a cache and rate gate here; a restart that loses a list loses queued work, which NFR-REL-01 forbids |
| `LISTEN/NOTIFY` to wake workers | Saves a one-second poll that costs one cheap indexed query; added complexity for no visible gain at this rate |
| Claim with `SELECT` then `UPDATE` | Two workers can both select the same row; the single `UPDATE ... SKIP LOCKED` cannot be raced |

## Consequences

- The queue is inspectable with SQL, and its state is covered by the same backups and migrations as the rest of the data.
- A one-second poll interval is the floor on how fast an idle worker notices a new job.
- The `crawl.queue.depth` gauge is deferred to the M4 dashboards; the About page reads pending depth from the table already.
- Polling would flood both the logs and the trace list (measured on the running stack: a statement log line about every half second, and a trace a second, 204 after three and a half minutes). The Worker sets the EF command log category to Warning, and claiming and stale recovery run with instrumentation suppressed, so an idle Worker produces no traces.
