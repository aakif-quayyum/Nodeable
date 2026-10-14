# Deezer fixtures

Real responses from Deezer's public API, captured on 2026-10-14 (three requests, no key needed), and served by WireMock in
the tests. The backend tests never call the real API. The preview URLs are signed and expire after 15 minutes, so the
`hmac` part was replaced with zeros; the `exp` part is the capture time plus 900 seconds.

| File | Request |
| --- | --- |
| `track-by-isrc.json` | `GET https://api.deezer.com/track/isrc:USYAH1600107`: Redbone by Childish Gambino, track 350320101, album image `52a01335022b31b52b96106583ead686` |
| `track-by-id.json` | `GET https://api.deezer.com/track/350320101`: the same track by ID, which is how a fresh preview URL is asked for |
| `no-data.json` | `GET https://api.deezer.com/track/isrc:ZZZZ00000000`: Deezer's miss, an **HTTP 200** with `{"error":{"code":800}}` |
