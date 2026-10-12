# 0019. A song is added by MBID alone, and a hub join carries the token as an argument

- **Status:** Accepted (implemented in M3, pull request 2; the developer approved the hub half and confirmed the add-song half, as built, on 2026-10-12)
- **Date:** 2026-10-12
- **Spec:** section 7 (flow: adding a song), section 9 (`POST /graphs/{id}/songs`, hub events), decisions 0007, 0009, 0018, FR-GRAPH-02, NFR-SEC-02

## Context

Two details of the graph API were not fixed by the spec.

**What a request to add a song carries.** `SongIngestionService` needs a title and an artist to create the `recordings` row that the graph's foreign key points at, and the spec's example request carries only `recordingMbid`. The browser has a title and artist from the search result, so sending them is possible. But `recordings` is a cache shared by every user's search (decision 0018): search reads its titles with the trigram index before it asks MusicBrainz. A client that is allowed to name the title of an MBID could add a made-up MBID with a made-up title. MusicBrainz will refuse it later (the job fails), but the row stays, and appears in other people's search results.

**How a browser proves it may join a graph's group.** The REST endpoints read the token from the `X-Graph-Token` header (decision 0007). A browser's `WebSocket` cannot set request headers, and SignalR's default for a token is the `access_token` query string, which ends up in proxy and server logs, where spec section 11 forbids anonymous graph tokens.

## Decision

- **The request carries the MBID only** (the spec's example). When the recording is not in the database, the Api asks MusicBrainz for its title and artist (`recording/{mbid}?inc=artist-credits`, the lightest lookup) through the shared gate with the interactive profile of decision 0018, and stores those. An MBID MusicBrainz does not know is `404 /errors/recording-not-found` and leaves no row. A recording already in the database costs no request.
- **The hub method is `JoinGraph(graphId, token)`**, with the token in the body of the message. The same check as for REST decides (`IGraphAccess`), and a wrong token and an unknown graph give one message.

## Alternatives considered

| Option | Why it lost |
| --- | --- |
| Take the title and artist from the request body | Faster by one request, but lets a client write into the shared cache. Cleaning up after fake MBIDs would need a second mechanism (delete the stub when its job fails), and until then the rows are search results. |
| Take the title and artist from the request body and verify them in the Worker | The stub exists meanwhile, so the window is the same; the Worker's fetch already overwrites the title, which is why it cannot be the check. |
| Keep search results for a while and look the MBID up there | Stateful, and a graph can be built from a link or an older tab, so the lookup must still have a fallback. |
| Token in the connection URL (`access_token`) | Logged by proxies and by the server. |
| A cookie | The spec has no tracking cookies (NFR-PRIV-01), and a cookie would make the REST and hub contracts differ for no gain. |

## Consequences

- Adding a song that is new to the cache costs two MusicBrainz requests: the title lookup in the request, and the recording fetch in the Worker (which still reads the credits, works, releases and ISRCs). The lookup is inside the person's request, so adding a new song takes about a second longer, and a busy gate answers `429` with `Retry-After`, as search does. A song already in the cache, which is most songs after the first user, costs none.
- A refinement is open: the lookup already has the artist credit, and the Worker's first job could skip repeating it. It is not done because it would mean two code paths for storing a recording.
- The hub token is visible in the frame of the `JoinGraph` message, inside TLS in production, and never in a URL or a log. Browser tools show it to its owner, who holds it anyway.
- The client must join, then load the snapshot (see section 9's `seq` rules), so joining is cheap and the token is checked once per join, not per message.
