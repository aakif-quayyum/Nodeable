# MusicBrainz fixtures

Real responses from the MusicBrainz web service, captured on 2026-10-11 with the project's User-Agent at no more than
one request per second, and served by WireMock in the tests. The backend tests never call the real API.
MusicBrainz core data is available under the CC0 licence.

| File | Request |
| --- | --- |
| `search-recordings.json` | `recording?query=recording:"Redbone" AND artist:"Childish Gambino"&limit=3&fmt=json` |
| `recording-lookup.json` | `recording/7408f11c-6c4e-41e5-b81b-6a15bf6cb268?inc=artist-credits+artist-rels+work-rels+releases+isrcs&fmt=json` (producer, mix, recording, instrument and vocal credits, and a link to a work) |
| `recording-lookup-no-credits.json` | The same lookup for `ac5977af-d4dc-4636-b867-b02e15d2f6d8`, a recording with no relationships at all |
| `work-lookup.json` | `work/c44370d6-70af-454f-8381-021d1f7b6fac?inc=artist-rels&fmt=json` (composer and lyricist credits) |
| `release-lookup.json` | `release/e84b58bb-e852-402a-8f01-cb5a9f5229b5?inc=artist-rels&fmt=json` |
| `error-503.json` | The body of a real 503 ("The MusicBrainz web server is currently busy"), received while capturing the search |
