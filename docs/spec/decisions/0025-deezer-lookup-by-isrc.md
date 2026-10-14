# 0025. Previews are found at Deezer by ISRC, and only IDs are stored

- **Status:** Accepted (built in M4 pull request 1; the cover ID and the stored ISRCs were part of the approved M4 plan, D1)
- **Date:** 2026-10-14
- **Spec:** FR-PREVIEW-01, NFR-CACHE-01, NFR-RATE-03, NFR-SEC-02, section 8 (`recordings.isrcs`, `previews.cover_md5`), section 9 (preview endpoint), section 10 (Deezer, fetch plan step 5); decisions 0009 and 0022

## Context

FR-PREVIEW-01 asks for a 30-second preview when Deezer has one, and decision 0022 settled that the preview audio is read by the browser and that only the track ID is stored, because the preview URL is signed and expires about 15 minutes after it is issued. Four things were not yet decided: how a recording is matched to a Deezer track, where the ISRC comes from when the preview job runs, how Deezer's responses are read, and what else about the track is worth keeping.

## What was checked (2026-10-14)

Three real responses, recorded as test fixtures (`tests/Nodeable.Infrastructure.Tests/Fixtures/deezer`):

- `GET api.deezer.com/track/isrc:{isrc}` answers with the track: its ID, `preview` (a signed URL), `duration` (the **full song**, 324 seconds for a song of which the preview is 30), and `album.md5_image` with the `cover_*` addresses built from it. It sends no rate-limit headers.
- **A miss is HTTP 200** with `{"error":{"type":"DataException","message":"no data","code":800}}`. A caller that trusts the status code would read a track that does not exist.
- `GET api.deezer.com/track/{id}` returns the same object with a freshly signed preview URL, which is how the Api asks for one when a person presses play.

## Decision

1. **Match by ISRC only.** The spec's "then title and artist" fallback is not built: a title and artist search can return a different recording or a cover, and a wrong preview is worse than none (principle 5). It is a task of its own if it is ever wanted, with a measured error rate.
2. **The ISRCs are stored on the recording** (`recordings.isrcs`, `text[]`, empty by default), written by the recording job from the MusicBrainz response it already has. The preview job runs after it, with only a recording MBID as its target (decision 0009), and fetching the recording again from MusicBrainz to find the ISRC would spend rate-gate slots on data we had. Rows stored before M4 have no ISRCs until the 30-day refresh (NFR-REL-03) fetches them again; the refresh is built to fill what rows lack.
3. **Only IDs are stored about the track:** `previews.provider_track_id` and `previews.cover_md5` (the album image ID, which is a stable identifier and not a signed address). A row exists only when Deezer's answer had a preview, so "there is a row" means "there is something to play", and the snapshot can say so without asking Deezer.
4. **The client reads the body, not the status.** `IDeezerClient` returns null for error 800, and throws `DeezerException` for the rest, marked transient (5xx, 429, error 4 "quota exceeded", error 700 "service busy") or not. A transient failure leaves the job to the queue's retries (NFR-REL-01); one that would repeat fails it at once.
5. **Deezer has its own shared gate** (`deezer` in Redis, the keyed registration of `IRateGate`): 200 ms between requests with a burst of 5, half of Deezer's documented 50 requests every 5 seconds (the documented figure is not re-verified here). It is separate from MusicBrainz's, so a slow crawl does not delay a person pressing play.
6. **The Api's preview answer is `{ url, expiresAt }`**, with `Cache-Control: no-store`. The spec said it would gain `durationSeconds`; Deezer has no length for the preview (its `duration` is the whole song), so there is nothing true to send, and the player reads the length from the decoded audio. `expiresAt` is read from the URL's signed `exp`, and is null when the URL does not carry one.
7. **A failure of Deezer is a 503 with `Retry-After`, never a 404**, so the player can tell "try again" from "this recording has no preview". The endpoint is limited to 60 a minute per address (NFR-SEC-02), because each call is a Deezer request through the gate.

## Alternatives considered

| Option | Why it lost |
| --- | --- |
| Fetch the recording again from MusicBrainz in the preview job to get the ISRC | One more gated request per recording for data already received; a second place that can fail |
| Put the ISRC in the job (a column on `crawl_jobs`) | A column used by one job kind, on a table that is deliberately kind-neutral |
| Search Deezer by title and artist when the ISRC finds nothing | Wrong-song previews; no way to tell without a measured threshold |
| Store the preview URL with a short expiry and reuse it | The answer is a signature that changes; a stored URL is useless within 15 minutes and would invite serving an expired one |
| Look the preview up on demand in the Api and store nothing | Every play would need the ISRC (so MusicBrainz or a stored copy anyway), and "has a preview" could not be known for a snapshot without a Deezer call per song |

## Consequences

- A migration adds two columns. Nothing is removed.
- `external.requests` counts Deezer's requests under `source=deezer`, and `preview.lookups{result=found|none}` counts the outcomes of the job, so the rollup of decision 0023 has both.
- A recording with several ISRCs is tried up to three times; the first with a preview wins.
- The cover ID is stored in this pull request and used in the next one (the art chain's third step, section 10).
