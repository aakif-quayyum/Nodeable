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
| `search-recordings-duplicates.json` | `recording?query=recording:"Redbone" AND artist:"Childish Gambino"&limit=25&fmt=json`, captured on 2026-10-12 (one request): all 11 recordings, with seven copies of the same song (studio, live bootlegs, a promo, DJ-mixes) and a radio edit and three remixes, each with its releases' status and release-group types. Used to test duplicate collapsing (FR-SEARCH-02). |
| `search-recordings-creep.json` | `recording?query=+recording:"Creep" +artist:"Radiohead" status:official^10&limit=30&fmt=json`, captured on 2026-10-12 (one request) and **reduced** to the fields the client reads (the media, tracks and tags were removed; every recording and release was kept). 30 recordings of one song, 193 in all at MusicBrainz, among them the 1992 original. Used for the duplicate-collapsing regression found by running the real stack. |
