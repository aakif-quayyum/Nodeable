# 0018. The Api asks MusicBrainz for searches, through the shared rate gate

- **Status:** Accepted (implemented in M3, pull request 1; approved by the developer on 2026-10-12)
- **Date:** 2026-10-12
- **Spec:** section 5 (NFR-PERF-01, NFR-RATE-01, NFR-RATE-03, NFR-SEC-02), section 7, section 9 (`/search/recordings`), section 10 (fetch plan step 1), FR-SEARCH-01, decisions 0009 and 0016

## Context

Section 9 says search is "local cache first, then MusicBrainz" and returns results, while section 7 said that only the Worker talks to external APIs and that the Api never waits on MusicBrainz. Both cannot hold for a search: the user is looking at the screen, so the answer has to come back in the same request, and it can only come from MusicBrainz when the cache has not seen the song.

Decision 0016 already made the rate gate a Redis token bucket shared by every instance, so the limit does not depend on which process makes the call.

## Decision

- **The Api calls `IMusicBrainzClient.SearchRecordingsAsync` itself**, for search only. Every other MusicBrainz fetch (recording, work, release, and later the artist) stays a job in the Worker.
- The Api registers the same client and the same Redis gate as the Worker (`AddMusicBrainz()` and `AddRedisClient("redis")`), so NFR-RATE-01 holds across both processes. There is no second limiter.
- **An interactive profile**, set in the Api's configuration and not in code: wait for the gate at most 2 seconds (`MusicBrainz:MaxGateWait`), retry once (`MaxRetries`), 5 seconds per attempt and 12 seconds in total. NFR-RATE-03 says "up to 5 retries"; the Worker keeps 5, and a person staring at a spinner gets 1.
- **A refused or failed search is an answer, not a hang.** A gate with no slot inside the cap is `429 /errors/rate-limited`; MusicBrainz answering 503 or 429 until the retries run out, or timing out, is `503 /errors/upstream-unavailable`; any other MusicBrainz error is `502 /errors/upstream-error`. All carry `Retry-After`.
- **No priority lanes in the gate.** The Worker takes one slot at a time, so the slot a search gets is at most one slot behind the one the Worker is about to use. Only many searches at once can exceed the 2 second cap, and then the cap does its job.
- The first search of this kind is cheap to defend: the Api already needs the database, and it now also needs Redis, so `/health` includes the Redis check.

## Alternatives considered

| Option | Why it lost |
| --- | --- |
| Search as a crawl job, answer streamed over SignalR | Adds a queue wait and a round trip to the interaction people feel most, and the page would need the hub for its first screen. A search has no use for retry-later semantics: if it is not answered now, nobody is waiting for it. |
| The Api forwards searches to the Worker over an internal call | A second hop and a second process in the request path for no gain: the gate is already shared, which is what the Worker was providing. |
| Search the cache only | The cache holds only songs someone has already added, so a new song could never be found. |
| A separate, faster rate gate for interactive calls | Two budgets against one MusicBrainz limit: the sum could exceed 1 request per second, which is what NFR-RATE-01 forbids. |

## Consequences

- The Api needs `MusicBrainz:ContactUrl` (the repository URL) like the Worker, and refuses to start without it.
- NFR-PERF-01 (search under 1 second at p95) holds when the cache answers or the gate is free; when MusicBrainz is slow or busy it does not, and the 5 second attempt timeout is the bound. k6 in M4 measures it. Two real requests made while building this, for a song with 193 recordings: 100 recordings came back in 1.4 seconds (485 KB), and the 30 the Api asks for are 310 KB. An uncached search of a popular song may therefore miss the 1 second target on MusicBrainz's own time.
- Per-IP limits (NFR-SEC-02, 60 searches a minute) protect the shared budget from one client. Behind Caddy in production they need forwarded headers to see the real address; that is part of the deployment work in M4.
- The cache hit counter (`cache.lookups`) now has its first producer: a search answered by the cache is a hit, one that went to MusicBrainz is a miss.
