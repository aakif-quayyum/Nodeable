# 0022. The preview waveform is decoded in the browser, because Deezer's preview audio allows it

- **Status:** Accepted (approved by the developer on 2026-10-14, with the answers under "Confirmed on approval". Nothing is built. FR-WAVE-01 is M4; FR-WAVE-02 is v3.)
- **Date:** 2026-10-14
- **Spec:** section 4, section 8 (`preview_analysis`, v3), section 9 (preview endpoint), section 10 (preview waveform, Deezer row), FR-PREVIEW-01, FR-WAVE-01, FR-WAVE-02, NFR-MOTION-01, NFR-A11Y-01

## Context

FR-WAVE-01 asks the preview player to draw a waveform with a playhead, with D3, from precomputed peaks. Peaks come from the audio, so the question is **where the audio is decoded**: in the browser (Web Audio's `decodeAudioData` needs the bytes, which a page can read from another origin only if that origin sends CORS headers) or in the Worker (which needs no CORS but needs an MP3 decoder in .NET and stores something). The developer asked for the answer to be checked rather than assumed.

## What was checked (2026-10-14)

A script (Node 24's `fetch`, run from this repository's scratchpad and not committed) asked Deezer's search for "Redbone" by Childish Gambino, took the first result's `preview` URL, and requested it with `Origin: http://localhost:5173`, once as a ranged `GET` and once as a CORS preflight.

| Request | Result |
| --- | --- |
| `GET` on the preview URL, `Origin` and `Range: bytes=0-1023` | `206`, `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Headers: Range`, `Access-Control-Expose-Headers` including `content-length` and `content-range`, `Accept-Ranges: bytes`, `Content-Type: audio/mpeg`, `Content-Range: bytes 0-1023/479827`, `Cache-Control: public, max-age=12235816`, `Vary: Origin` |
| `OPTIONS` on the preview URL, `Access-Control-Request-Method: GET` | `200`, `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Headers: Range`, `Access-Control-Max-Age: 86400` |
| `GET` on `api.deezer.com/search` with `Origin` | `200`, **no `Access-Control-Allow-Origin`** (the headers it does send are `Access-Control-Allow-Methods` and similar) |

Other facts from the same response:

- The preview is a plain MP3 of about 480 KB for 30 seconds, from `cdnt-preview.dzcdn.net`.
- The URL is **signed and expires**: it carries `hdnea=exp=…~hmac=…`, and the expiry was 900 seconds after the request. A stored URL is useless within a quarter of an hour, which is why `previews` stores only the track id (section 8).
- The Deezer API itself does not send an allow-origin header, so a browser cannot call it directly. That matches the design in which the Api resolves the track and returns the URL (`GET /api/v1/recordings/{mbid}/preview`).

## Re-checked from the page (2026-10-14, M4 pull request 3)

The decision asked for the check to be repeated at the start of the work on previews. The first check used Node's `fetch` with an `Origin` header, which proves what the server sends but not what a browser does with it, so this one ran in the browser pane, from the app's own origin (`http://localhost:5173`), on the signed URL the Api returned for a stored track:

| Request, from the page | Result |
| --- | --- |
| `fetch(url, { mode: 'cors', credentials: 'omit' })`, body read as bytes | `200`, response type `cors`, `audio/mpeg`, 479,827 bytes: the page can read them |
| `decodeAudioData` on those bytes | 29.99 s, 2 channels, 48 kHz |
| the same with `Range: bytes=0-1023` | `206`, `Content-Range: bytes 0-1023/479827`, 1,024 bytes |
| `fetch('https://api.deezer.com/track/…', { mode: 'cors' })` | refused by the browser (no allow-origin header), as before |

The decision stands: nothing is stored for FR-WAVE-01 and no Worker job is needed. (`Access-Control-Allow-Origin` itself is not readable by a page, so the proof is that the body was.) The built behaviour, including what happens when this stops being true, is in section 10 of the spec.

## Decision

1. **FR-WAVE-01 decodes in the browser.** The page fetches the preview audio itself (the URL comes from the Api's preview endpoint, resolved fresh from the stored track id, never stored), decodes it with Web Audio's `decodeAudioData`, folds it to mono and reduces it to a fixed number of peaks, and draws those with D3. The peaks are "precomputed" in that they are computed once, before the first frame is drawn, and not on every frame.
2. **Nothing is stored for FR-WAVE-01**: no audio and no peaks. M4 needs no new table and no Worker job.
3. **The waveform is optional.** If the fetch or the decode fails (CORS removed, the URL expired, a network error), the player plays as it would without a waveform: a progress bar and the time. It never blocks playback.
4. **The check is repeated** at the start of M4 (the milestone-start review of held assumptions), because a CORS header is a setting and not a promise. If it has gone, the Worker path in the alternatives below is built instead of this one, and the spec's section 10 is updated.
5. **FR-WAVE-02 (v3) is computed in the Worker and stored** (`preview_analysis`), as the developer specified: band-split peaks, tempo and (stretch) key are digital signal processing that should happen once per recording and be shared by every user. When a row exists, FR-WAVE-01 reads its peaks and does not decode; the browser decode stays as the fallback for a recording not analysed yet.

## Confirmed on approval

- 160 peaks for FR-WAVE-01.
- With reduced motion the record does not spin, and the playhead and the time still move (they are the position, not decoration); FR-WAVE-02's waveform is static.
- Deezer's terms for analysing previews and the choice of decoder and algorithms stay open, and are settled before FR-WAVE-02 starts (section 15).

## Alternatives considered

| Option | Why it lost, for M4 |
| --- | --- |
| The Worker fetches the preview, computes peaks and duration, and stores them | Works whatever Deezer's headers are, and the waveform could be drawn before play. But it needs an MP3 decoder in .NET (a library to choose and vet), a new job kind and table, and storage of a derived value, for a feature whose input the browser can already read. It is the v3 path, where the analysis has to be server side anyway. |
| Play through an `<audio>` element and read levels with an `AnalyserNode` | No separate fetch, but a `MediaElementAudioSourceNode` outputs silence for a cross-origin file without CORS, and live levels give a waveform that exists only as far as the playhead has gone, which is not the whole-file picture the requirement asks for. |
| Proxy the audio through the Api | Puts 480 KB per play through the Api for nothing (the origin sends the headers), and makes Nodeable the party that serves the audio, which the non-goal "streaming or hosting full audio" avoids. |

## Consequences

- A play costs one more fetch of about 480 KB (the file is also what plays, and the host's `Cache-Control` lets the browser reuse it). Peaks for 30 seconds at 44.1 kHz decode to about 10 MB of floats in memory, released after the reduction.
- The playing record and the playhead are drawn from the same time source as the audio element, so they cannot drift (FR-WAVE-01).
- **Not verified, and a gate for v3:** whether Deezer's terms allow the audio to be analysed and the derived values stored. The values are not audio, but the terms have not been read for this. It is an open question in section 15 and is settled before FR-WAVE-02 starts.
- **Not verified:** which .NET library decodes MP3 portably and which BPM and key algorithms are good enough. Both are chosen, with a test against recordings of known tempo, when v3 starts.
