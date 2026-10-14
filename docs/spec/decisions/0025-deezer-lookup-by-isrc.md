# 0025. Previews are found at Deezer by ISRC, then by a guarded title-and-artist match, and only IDs are stored

- **Status:** Accepted (built in M4 pull request 1; the cover ID and the stored ISRCs were part of the approved M4 plan, D1; the guarded fallback was added on the developer's instruction on 2026-10-14 after the first version measured one preview in ten)
- **Date:** 2026-10-14
- **Spec:** FR-PREVIEW-01, NFR-CACHE-01, NFR-RATE-03, NFR-SEC-02, section 8 (`recordings.isrcs`, `previews.cover_md5`, `previews.matched_by`), section 9 (preview endpoint), section 10 (Deezer, fetch plan step 5); decisions 0009 and 0022

## Context

FR-PREVIEW-01 asks for a 30-second preview when Deezer has one, and decision 0022 settled that the preview audio is read by the browser and that only the track ID is stored, because the preview URL is signed and expires about 15 minutes after it is issued. Four things were not yet decided: how a recording is matched to a Deezer track, where the ISRC comes from when the preview job runs, how Deezer's responses are read, and what else about the track is worth keeping.

## What was checked (2026-10-14)

Real responses, recorded as test fixtures (`tests/Nodeable.Infrastructure.Tests/Fixtures/deezer`):

- `GET api.deezer.com/track/isrc:{isrc}` answers with the track: its ID, `preview` (a signed URL), `duration` (the **full song**, 324 seconds for a song of which the preview is 30), and `album.md5_image` with the `cover_*` addresses built from it. It sends no rate-limit headers.
- **A miss is HTTP 200** with `{"error":{"type":"DataException","message":"no data","code":800}}`. A caller that trusts the status code would read a track that does not exist.
- `GET api.deezer.com/track/{id}` returns the same object with a freshly signed preview URL, which is how the Api asks for one when a person presses play.
- `GET api.deezer.com/search?q={words}` returns `{"data":[track, ...],"total":n}` with each track's `title`, `duration`, `artist.name`, `album.md5_image` and a signed `preview`. Deezer's field syntax (`artist:".." track:".."`) returned nothing when tried, so the query is the words `{artist} {title}`.

## Decision

1. **Match by ISRC first, then by a guarded title and artist match.** The first version matched by ISRC only and measured about one preview in ten (below), so the developer asked for the second step of section 10. A search can return a different recording or a cover, and a wrong preview is worse than none (principle 5), so a search result is used only when **every** rule holds (`PreviewMatcher`, one named, tested rule each):
   - it has a preview;
   - the **first-named artist** equals the recording's, after normalising (case, accents, punctuation and "&" ignored; "feat." credits dropped from both sides);
   - the **title** equals the recording's after normalising and after dropping only decoration that does not make a different recording: a `(feat. ...)` credit and a remaster or "album version" label (`- 2011 Remaster`, `(Remastered 2009)`, `(Album Version)`). Any other bracket (live, remix, acoustic, radio edit, instrumental, a year of a re-recording) stays and must be equal;
   - its length is **within 10 seconds** of MusicBrainz's `length_ms` (5 seconds in the first version; widened on 2026-10-14, below), and a recording with no length matches nothing.

   Of several that pass, the closest length wins and Deezer's order breaks a tie. There is no score and no threshold: a near miss is no match.
2. **The ISRCs are stored on the recording** (`recordings.isrcs`, `text[]`, empty by default), written by the recording job from the MusicBrainz response it already has. The preview job runs after it, with only a recording MBID as its target (decision 0009), and fetching the recording again from MusicBrainz to find the ISRC would spend rate-gate slots on data we had. Rows stored before M4 have no ISRCs until the 30-day refresh (NFR-REL-03) fetches them again; the refresh is built to fill what rows lack. Every recording gets a preview job, with or without an ISRC, because the fallback needs only the title, artist and length.
3. **Only IDs are stored about the track, and how it was matched:** `previews.provider_track_id`, `previews.cover_md5` (the album image ID, a stable identifier and not a signed address) and `previews.matched_by` (`isrc` or `title_artist`, a CHECK-constrained column, default `isrc` for rows from before the fallback). A row exists only when Deezer's answer had a preview, so "there is a row" means "there is something to play", and the snapshot can say so without asking Deezer.
4. **The client reads the body, not the status.** `IDeezerClient` returns null (a lookup) or an empty list (a search) for error 800, and throws `DeezerException` for the rest, marked transient (5xx, 429, error 4 "quota exceeded", error 700 "service busy") or not. A transient failure leaves the job to the queue's retries (NFR-REL-01); one that would repeat fails it at once.
5. **Deezer has its own shared gate** (`deezer` in Redis, the keyed registration of `IRateGate`): 200 ms between requests with a burst of 5, half of Deezer's documented 50 requests every 5 seconds (the documented figure is not re-verified here). It is separate from MusicBrainz's, so a slow crawl does not delay a person pressing play. The fallback adds at most one search request per recording.
6. **The Api's preview answer is `{ url, expiresAt }`**, with `Cache-Control: no-store`. The spec said it would gain `durationSeconds`; Deezer has no length for the preview (its `duration` is the whole song), so there is nothing true to send, and the player reads the length from the decoded audio. `expiresAt` is read from the URL's signed `exp`, and is null when the URL does not carry one.
7. **A failure of Deezer is a 503 with `Retry-After`, never a 404**, so the player can tell "try again" from "this recording has no preview". The endpoint is limited to 60 a minute per address (NFR-SEC-02), because each call is a Deezer request through the gate.
8. **Hit rates are counted:** `preview.lookups{result=found, method=isrc|title_artist}`, `{result=rejected}` (Deezer had candidates and the guard refused all) and `{result=none}` (Deezer had nothing), so the rollup of decision 0023 can show the rate per method and how often the guard says no.

## What was measured (2026-10-14, the real stack)

**First version, ISRC only, ten recordings:** four had an ISRC on MusicBrainz and Deezer knew one of them: **1 preview in 10**. Six recordings (two each of Get Lucky, Billie Jean and Hey Ya!) had no ISRC at MusicBrainz at all.

**With the fallback, twenty songs across genres,** each the first MusicBrainz result for the title and artist, added to a new graph and run by the Worker (the Worker's own recording and preview jobs, not a script's matching). Two of the twenty (Redbone, Get Lucky) were already stored before this change, so they had no ISRCs and no new preview job; they are left out of the rates, which are over **18**.

| Genre | Song | MusicBrainz (length, ISRCs) | Result |
| --- | --- | --- | --- |
| Pop | Billie Eilish, bad guy | 194 s, 1 | `title_artist`, Deezer 194 s |
| Pop | The Weeknd, Blinding Lights | 262 s, 1 | none: no preview for its ISRC at Deezer, and the studio track there is 200 s, so the guard refused it |
| Pop | Dua Lipa, Levitating | 204 s, 1 | `isrc`, 203 s |
| Pop | Taylor Swift, Love Story | 234 s, 2 | `isrc`, 237 s |
| Rock | Nirvana, Smells Like Teen Spirit | 280 s, 0 | none: Deezer's studio track is 301 s |
| Rock | Radiohead, Creep | 237 s, 1 | `isrc`, 238 s |
| Rock | Queen, Bohemian Rhapsody | 356 s, 0 | `title_artist`, 354 s |
| Rock | Fleetwood Mac, Dreams | 257 s, 7 | `isrc`, "Dreams (2018 Remaster)" 257 s |
| Hip-hop | Kendrick Lamar, HUMBLE. | 185 s, 1 | none: Deezer's is 177 s (8 s apart; probably the same song) |
| Hip-hop | Kanye West, Gold Digger | 157 s, 0 | none: Deezer's are 208 s and 197 s |
| Hip-hop | Eminem, Lose Yourself | 329 s, 0 | `title_artist`, 326 s |
| Hip-hop | Childish Gambino, Redbone | stored before the change | not run (would be `title_artist`, 326 s against 327 s) |
| Electronic | Daft Punk, Get Lucky | stored before the change | not run |
| Electronic | Avicii, Wake Me Up | 247 s, 1 | `isrc`, 249 s |
| R&B / soul | Beyoncé, Halo | 262 s, 1 | `isrc`, 262 s |
| R&B / soul | Marvin Gaye, What's Going On | 234 s, 0 | `title_artist`, 237 s (the title has a curly apostrophe at MusicBrainz) |
| Jazz | Miles Davis, So What | 1051 s, 0 | none: Deezer's are 749 s, 562 s and live takes |
| Reggae | Bob Marley & The Wailers, Three Little Birds | 192 s, 0 | none: Deezer's is 183 s (9 s apart; probably the same song) |
| Latin | Shakira, Hips Don't Lie | 262 s, 0 | none: Deezer's are 209 s and 221 s |
| Classical | Ludovico Einaudi, Nuvole Bianche | 358 s, 2 | `isrc`, "Einaudi: Nuvole Bianche" 360 s |

- **Of 18: 11 found (7 by ISRC, 4 by title and artist), 7 not.** ISRC alone would have found 7 (39%); with the fallback 11 (61%). The fallback supplied 4 of the 11.
- **No wrong match among the 11.** Judged from Deezer's own record of each stored track (title, artist, length) against MusicBrainz's; audio was not compared. The sample is small and is not a measured error rate.
- **Of the 7 not found,** 5 differ from Deezer's studio track by 21 to 302 seconds, which is what a different edit or version looks like and what the guard is for (the audio was not compared); 2 are probably the same song 8 and 9 seconds apart (HUMBLE., Three Little Birds), which the 5-second rule refuses on purpose. Moving the limit would trade correct rejections for coverage; it is a number to revisit with the counters, not a guess to make now.
- **Covers and tributes by other artists** (Lee Sang Gul and Mellow Melodies in the recorded Redbone search, "Daft Punk Experience" in the Get Lucky one) sit among the first results with the same title, which is why the artist is compared and not just the title.

### The same check with the window at 10 seconds (2026-10-14)

The window was widened from 5 to 10 seconds on the developer's instruction (ISRC matches unchanged; the label rules unchanged, so live, remix, edit, acoustic and instrumental versions are still refused by their title). The preview jobs of the same twenty songs were queued again on the real stack and run by the Worker:

| | 5 seconds | 10 seconds |
| --- | --- | --- |
| Found by ISRC | 7 | 7 |
| Found by title and artist | 4 | **6** (adds HUMBLE., 185 s against 177 s, and Three Little Birds, 192 s against 183 s) |
| Not found | 7 | **5** (Blinding Lights, Smells Like Teen Spirit, Gold Digger, So What, Hips Don't Lie) |
| Hit rate over the 18 | 61% | **72%** (13 of 18; ISRC alone 39%) |

- **Nothing else changed:** the 11 earlier matches are the same tracks, and the 5 still refused differ by 21 to 302 seconds, so the wider window accepted exactly the two cases it was widened for in this sample.
- **No wrong match among the 13**, judged as before from Deezer's own title, artist and length for each stored track; audio was not compared.
- **Redbone**, which was stored before the change and so was not among the 18, was also run: matched by title and artist (326 s against 327 s). Get Lucky was not matched (237 s at MusicBrainz; Deezer's are 248 s and 367 s).
- **Tests:** HUMBLE. and Three Little Birds are test cases of the guard, and so are three of Deezer's recorded versions of Three Little Birds (Exodus 40 Mix, Dub, Alternate Mix, 187 to 195 seconds), which sit inside the window and are refused by their label.

## Alternatives considered

| Option | Why it lost |
| --- | --- |
| ISRC only (the first version of this decision) | One preview in ten, then 39% on the twenty songs; most songs would play nothing |
| A similarity score with a threshold | A threshold hides which near misses were accepted and cannot be explained as a rule; the guard is a list of reasons each with a test |
| Match the title only and trust the first search result | Covers and tributes are in the first results of popular songs |
| The 5 second window of the first version | Refused two songs that were probably the same recording (8 and 9 seconds apart); widened to 10 s on the developer's instruction |
| A window wider than 10 s (15 s or more) | Would accept more edits and fades of other versions; the refused cases in the sample are 21 seconds or more away, and there is no data yet to justify a larger number |
| Fetch the recording again from MusicBrainz in the preview job to get the ISRC | One more gated request per recording for data already received; a second place that can fail |
| Put the ISRC in the job (a column on `crawl_jobs`) | A column used by one job kind, on a table that is deliberately kind-neutral |
| Store the preview URL with a short expiry and reuse it | The answer is a signature that changes; a stored URL is useless within 15 minutes and would invite serving an expired one |
| Look the preview up on demand in the Api and store nothing | Every play would need the ISRC (so MusicBrainz or a stored copy anyway), and "has a preview" could not be known for a snapshot without a Deezer call per song |

## Consequences

- Two migrations add three columns (`recordings.isrcs`, `previews.cover_md5`, `previews.matched_by`). Nothing is removed.
- `external.requests` counts Deezer's requests under `source=deezer`, and `preview.lookups` counts the outcomes by result and method, so the rollup of decision 0023 has the hit rate per method.
- A recording with several ISRCs is tried up to three times; the first with a preview wins, and the search runs only when none did.
- A song stored before M4 has no ISRCs, so it gets a preview only when the 30-day refresh (PR 6) runs for it. Until then it plays nothing and shows the link out.
- `matched_by` makes a wrong match findable: if one is ever reported, `select ... where matched_by = 'title_artist'` is the whole candidate list.
- The cover ID is stored in this pull request and used in the next one (the art chain's third step, section 10).
