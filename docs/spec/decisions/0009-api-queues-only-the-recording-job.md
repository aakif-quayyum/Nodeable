# 0009. The Api queues only the recording job; the Worker queues the rest

- **Status:** Accepted (implemented in M2)
- **Date:** 2026-10-11
- **Spec:** section 7 ("Flow: adding a song"), section 9 (add a song), section 10 (fetch plan), NFR-REL-01, FR-GRAPH-02

## Context

Section 7 step 3 said the Api queues up to four jobs (recording, work, release, preview) when a song is added. But the work and release IDs, and the ISRC used to find the preview, only appear in the response to the recording fetch. At the moment of the click the Api knows exactly one MusicBrainz ID. Step 4 of the fetch plan (the release fetch) is also conditional: "only when steps 2 and 3 found no producer", which only the Worker can decide.

## Decision

- Adding a song makes the Api upsert the `recordings` row (so the `graph_songs` foreign key holds) and queue **one `recording` job**. The unique index on pending and running jobs deduplicates it (`crawl.deduplicated`).
- The Worker, after fetching the recording, upserts the links and **queues the follow-up jobs itself**: one `work` job per linked work, a `preview` job when an ISRC is known, and the `release` job only when no producer credit was found after the recording and work steps.
- Follow-up jobs carry the same stored `traceparent` as the job that created them, and inherit its priority, so a user's click stays one trace and interactive work stays ahead of scheduled work.
- `pendingJobs` in the 202 response starts at **1** and grows as the Worker queues more. `CrawlProgress.queued` and `etaSeconds` are estimates and may rise.

## Alternatives considered

| Option | Why it lost |
| --- | --- |
| The Api queues four placeholder jobs and the Worker fills them in | `target_mbid` is part of the unique index and is unknown at that point, so deduplication breaks. |
| One job does every step for a song | The spec wants each step to retry on its own ("a failure retries only that step"). |

## Consequences

- Sections 7, 9 and 10 change: the example response says `pendingJobs: 1`, and the Worker is described as queuing the rest.
- The UI must not show progress as "n of 4": the total is not known up front.
- A recording that is already cached queues nothing and returns its credits immediately, as before.
