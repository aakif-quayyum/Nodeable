# 0015. A recording's credits status is derived from the roles credited

- **Status:** Accepted (implemented in M2, [pull request 16](https://github.com/aakif-quayyum/Nodeable/pull/16); approved by the developer on 2026-10-12)
- **Date:** 2026-10-12
- **Spec:** section 8 (`recordings.credits_status`), section 9 (`creditsStatus`), FR-GRAPH-04, principle 5 (honest data), decision 0009

## Context

Section 8 gives `credits_status` the values `complete`, `partial` and `none` but does not say what they mean. Two things depend on the meaning. FR-GRAPH-04 shows a "credits incomplete" badge when a song has no producer and no writer credit. And the Api answers "add a song" from the cache when credits already exist, so the value also decides when a fetch is skipped.

## Decision

The status is **computed from every credit a recording has at recording, work and release level** (the `recording_people` view) and recomputed after each step of the fetch plan, so it rises as work and release credits arrive:

| Status | Meaning |
| --- | --- |
| `complete` | A producer and a songwriter are both credited (the pair FR-GRAPH-04 looks for) |
| `partial` | Something is credited, but not both a producer and a songwriter |
| `none` | Nothing is credited |

- A song whose status is not `none` is served from the cache without a new fetch.
- The "credits incomplete" badge (FR-GRAPH-04, M3) is the absence of both roles, which the Api reads from the roles themselves, so it does not depend on this column.
- The rule lives in one pure function, `CreditsStatusCalculator`, in `Domain`.

## Alternatives considered

| Option | Why it lost |
| --- | --- |
| `complete` only when every step of the fetch plan has finished | Says "complete" about a song that simply has few credits on MusicBrainz, and a song with real credits would show as unfinished for as long as its slowest job takes |
| `complete` also requires an engineer | Many songs have no engineer credited on MusicBrainz, so most of the catalogue would be `partial` for a reason users cannot fix |
| Treat `status = none` after a successful fetch as "fetched, nothing found" and cache it | Needs a second signal (a fetched flag) the schema does not have; refetching a song with no credits costs one to two requests and is bounded by the queue's deduplication |
| Compute the status when reading instead of storing it | The column is in the spec and the events (`SongStatusChanged`) need a stored transition to compare against |

## Consequences

- A song whose only credits are instruments, vocals or engineering is `partial`: something to show, but it will still wear the incomplete badge.
- A song with no credits at all is `none` and is fetched again each time someone adds it. The refresh policy for old data (NFR-REL-03) is unchanged.
- Changing the rule means changing one function and its tests, and recomputing the column.
