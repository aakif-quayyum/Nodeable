# 0016. The MusicBrainz request pipeline: a Redis token bucket inside the retry

- **Status:** Accepted (implemented in M2, [pull request 14](https://github.com/aakif-quayyum/Nodeable/pull/14))
- **Date:** 2026-10-12
- **Spec:** NFR-RATE-01, NFR-RATE-03, section 10 ("How the client calls MusicBrainz"), section 11 (spans and metrics)

## Context

MusicBrainz allows about one request per second per IP and answers 503 above that. Several Worker instances must share one budget (NFR-RATE-01), and a 503 or 429 must be retried with backoff and jitter, up to five times (NFR-RATE-03). The two interact: a retry is a new request, so it must be limited too. `ServiceDefaults` also gives every `HttpClient` the standard resilience handler (3 retries, a circuit breaker, short timeouts), which is the wrong shape for this API.

## Decision

- **The gate is a token bucket in Redis**, kept as one number (the "theoretical arrival time" of the GCRA form) and decided in one Lua script that uses Redis's own clock. Each caller is given its own slot and sleeps for it; nobody polls. Defaults: one request per second, a burst of one.
- **The gate sits inside the retry.** The pipeline, outermost first: total timeout (5 minutes), retry, gate, request counter, per-attempt timeout (30 seconds, which includes the gate wait). Every attempt, including each retry, waits for its own slot.
- **A caller that would wait longer than 20 seconds is refused** (`RateGateSaturatedException`) instead of queueing without limit. A refused caller does not consume a slot, and the crawl queue retries the job later.
- **Retries:** 503, 429, network failures and a timed-out attempt; five retries; exponential backoff from two seconds with jitter; `Retry-After` replaces the calculated delay. Other errors (400, 404) are returned, not retried.
- **The standard handler is removed for this client** (`RemoveAllResilienceHandlers`, an API Microsoft marks experimental) so two retry layers do not multiply the attempts. A test counts exactly six attempts, so a change in that API's behaviour is caught.
- **Responses are parsed strictly**: a response missing a field the typed model requires fails the call instead of leaving nulls in the cache.
- **No circuit breaker.** At one request per second the standard handler's thresholds would never trip, and a breaker would add a state to reason about without protecting anything the gate and the queue's backoff do not.

## Alternatives considered

| Option | Why it lost |
| --- | --- |
| Gate outside the retry | Retries would skip the line, so after a 503 (when MusicBrainz is already struggling) the system could exceed one request per second |
| `System.Threading.RateLimiting` in each process | Limits are per process, so N Workers send N requests per second |
| Redis `INCR` with an expiry (fixed window) | Allows two requests at a window boundary (one at the end of a second, one at the start of the next) |
| A distributed lock held for one second per request | Serialises the whole request, not just the start, and a crashed holder blocks everyone until its lock expires |
| Polling for a token in a retry loop | Every waiter retries in a loop, and nobody has a place in line |
| Keep the standard handler and add a second one | Retries multiply (the mutation check saw 24 requests instead of 6) |

## Consequences

- The retry, gate and timeouts are three settings groups in `MusicBrainzOptions`, bound from configuration.
- A second external API (Discogs, v2) gets its own gate by registering another keyed `IRateGate`.
- The time spent waiting is visible as the `ratelimit.acquire` span and the `ratelimit.wait` histogram.
