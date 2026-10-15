# 0026. When no match is confident, a person picks the right version from Deezer's first results

- **Status:** Accepted 2026-10-15. The developer approved the amendment to FR-PREVIEW-01 after trying it, with the condition kept: **before launch, picks must need sign-in or an admin's approval** (below).
- **Date:** 2026-10-14
- **Spec:** FR-PREVIEW-01 (amended), section 8 (`previews.matched_by`, `previews.picked_at`), section 9 (preview endpoints), section 10 (fetch plan, step 5), section 15 (risks); decisions 0021, 0022 and 0025

## Context

Decision 0025 refuses a Deezer result unless the first-named artist and the title are equal, the length is within 10 seconds and a preview is present, because a wrong preview is worse than none. That is the right default, and it leaves songs silent: in the dev database, 12 of 38 recordings had no preview after the refresh (Blinding Lights, Smells Like Teen Spirit, Gold Digger, So What, Sweatpants and others), mostly because MusicBrainz's recording is a different edit from Deezer's studio track. "Find it on Deezer" sends the person away and fixes nothing for the next visitor.

## Decision

1. **A person can pick the right version.** When a recording has no preview row, the page offers "Pick the right version". It lists Deezer's first five search results that have a preview, each with its cover, title, artist, album and length, and the person chooses one.
2. **The choice is stored, and then it plays for everyone:** `previews.matched_by = 'user_pick'` and `previews.picked_at = now()`. The row is the same shape as any other, so the snapshot, the player and the cover chain need no new path.
3. **The server never trusts the browser's choice.** `POST /api/v1/recordings/{mbid}/preview/pick` takes only a track ID (digits, at most 20). The Api searches Deezer again for that recording and accepts the track only if it is among the results it would have offered. The write is `INSERT ... ON CONFLICT DO NOTHING`, so a preview that arrived in the meantime (a refresh, or another person's pick) is never replaced by a pick. The recording must be stored (a made-up MBID gets `404`) and must have no preview row (`409` otherwise).
4. **A refresh never replaces a pick.** The preview job's upsert has `WHERE previews.matched_by <> 'user_pick'`, so neither the 30-day refresh nor a later ISRC match overwrites a person's choice. Removing or replacing a pick is an admin task (below).
5. **Limits.** Candidate lists and picks share one limit of 10 a minute per address (`RateLimiting:PreviewPickPermitsPerMinute`), lower than playing (60) because each is a Deezer search through the shared gate and a pick writes to a cache everyone reads.
6. **The Deezer link stays**, inside the dialog, as the last resort for when none of the five is right.
7. **`user_pick` is counted:** `preview.lookups{result=found, method=user_pick}`, next to `isrc` and `title_artist`, so the share of songs that needed a person shows in the rollup.

## Before launch (a condition, not built here)

An anonymous pick changes what every visitor hears. Today it is limited per address, restricted to tracks Deezer returned for that recording, allowed only while there is no preview, and recorded with how and when, so a wrong one can be found with `where matched_by = 'user_pick'` and deleted. That is acceptable for a development database and a portfolio demo with one user; it is not acceptable for a public site. **Before the repository and the site go public, a pick must need sign-in or an admin's approval**, in the model of decision 0021 (community credits are held in a queue and reviewed): the pick is held as a proposal, the song plays for the person who proposed it, and it plays for everyone after the `admin` approves. This depends on accounts (v2, FR-AUTH-01), so until they exist the choices are to keep picks off in production, or to limit them to the developer's own graph.

## Alternatives considered

| Option | Why it lost |
| --- | --- |
| Loosen the guard (a wider length window or fuzzier titles) | Accepts wrong versions silently; the point of the guard is that a near miss is no match |
| Keep only "Find it on Deezer" | The song stays silent for everyone, and the person who cared has done the work for nothing |
| Store the pick per person (a local override) | The cache is shared on purpose (NFR-CACHE-01); a pick per person would be lost with the browser and never help the next visitor |
| Let the browser send the title, artist and preview address | A client could put any address in the shared cache; only a Deezer ID that the Api re-checks is accepted |
| Let a pick replace an existing preview | Anyone could swap a correct preview for a wrong one; picks are only for songs with none |

## Consequences

- A migration adds `previews.picked_at` and widens the CHECK constraint on `matched_by`.
- Two endpoints and one hub path (`PreviewFound`, already added in M4 pull request 2) carry the feature; nothing else changes for the player.
- The pre-launch condition is a gate, not a todo that can be forgotten: it is on the list of things to settle before the site goes public (section 14 and the risk table in section 15).
