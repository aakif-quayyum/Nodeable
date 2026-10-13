# 0020. UI refresh: orbit and constellation replace the force canvas

- **Status:** Accepted (approved by the developer on 2026-10-13, with the answers listed under "Confirmed on approval"; built pull request by pull request, see "Changes after the first screens were reviewed")
- **Date:** 2026-10-13
- **Spec:** section 4 (FR-VIEW-01, FR-VIEW-02, FR-NOTES-01, FR-LAND-01, FR-GRAPH-05, FR-ART-01, FR-HUB-02 reworded), section 5 (NFR-MOTION-01), section 8 (`releases`), section 10 (album art), section 12 (frontend, rewritten), section 14 (M3R), decisions 0002, 0010, 0013
- **Reference design:** `docs/design/nodeable-ui-prototype.html`, a self-contained prototype with fake data. Its CSS, markup and interaction code are the visual reference; its data is not.

## Context

M3 shipped a force-directed canvas for the whole graph, with a left panel (hubs, role filters) and a details panel. It works, and it measured well (a 600-node layout step took 2.4 ms and a frame 0.4 ms), but it answers one question, "what does everything look like?", and answers it as a hairball: with 50 songs and several hundred people, nobody can read it. The developer has designed a replacement in a prototype: a graph you read one song or person at a time (an **orbit**), an overview you can fall back to (a **constellation**), and a right column of **connector cards** and **liner notes** that carry the detail.

The prototype is a design reference, not code to port. It uses fake data, builds its DOM with string templates, reads `prefers-reduced-motion` once at load, and was written without the accessibility constraints this project has (see the table below).

## Decision

**Views (spec section 12).**

- **OrbitView** is the main view. It is a radial tree drawn in SVG: `d3-hierarchy`'s `tree()` lays out two levels around the centre, `d3-shape`'s `linkRadial` draws the links, and a small `d3-timer` loop interpolates each node's polar coordinates when the centre changes (angle along the shortest arc, radius linearly). The centre is one song or one person; depth is 2; role arcs name the roles of a song's people; clicking or pressing Enter on a node makes it the centre, and a breadcrumb trail of the last four centres jumps back.
- **ConstellationView** is the whole-graph overview, with `d3-force`, `d3-zoom` and `d3-drag`. Clicking a node opens it as the centre of the orbit. An Orbit/Constellation toggle in the header switches between them.
- **Connector cards** (people on two or more songs, most songs first, FLIP reorder, count-up) replace the "Your hubs" panel and still satisfy FR-HUB-02. **Liner notes** (one card per song with its credits grouped by role, status, and new credits highlighted) are the per-song detail. The **Text view** (the tables of M3's `GraphListView`) stays and carries the same data (NFR-A11Y-01).
- A **landing page** (hero, steps, search) and a **search sheet** (an MUI dialog opened from the header) replace today's home page and app-bar search.

**SVG or canvas for the constellation (NFR-PERF-03).**

- The **orbit is always SVG**: it is bounded (the centre, its direct neighbours and their neighbours, with the second level capped at 60 nodes and the rest shown as "+N more"), so it has at most about a hundred nodes however large the graph is, and SVG gives focusable nodes, real text and cheap CSS styling.
- The **constellation is SVG up to a node threshold and canvas above it.** The graph can reach 50 songs and about 550 people, and an SVG with a few thousand elements whose attributes change on every simulation tick is where phones slow down. The canvas path is what M3 already built and measured: `GraphLayout` (with the Web Worker above 500 nodes), the quadtree hit test and `drawGraph`, restyled to the new tokens. The threshold starts at **250 nodes** and is a constant; the first pull request that builds the SVG constellation measures the largest SVG graph that holds NFR-PERF-03's frame rates on the development machine and with a CPU slowdown, and records the number in the spec.
- Above the threshold, nodes are not individually focusable (a canvas has no elements). The same data is reachable from the connector cards, the liner notes, the "Find in your graph" box and the Text view, and every node opens in the orbit, which is SVG; this is recorded as the known trade-off.

**What is removed.** `GraphCanvas`'s old look and the left panel with `HubsPanel`/`HubBar` and `NodePanel` go; their code is not kept behind a flag. What stays and is reused: the live graph hook and the event reducer (`useLiveGraph`, `applyGraphEvent`), the layout engine and worker, the quadtree, `GraphListView`, the role filter store, and every API and hub contract.

**Design tokens and fonts (spec section 12).** A flat palette with no gradients (the prototype's `--bg`, `--panel`, `--line`, `--fg`, `--muted`, role colours), expressed in the MUI theme so that inputs, buttons, dialogs and sheets stay MUI and take the look from the theme. Display type is **Archivo** (variable, `wdth` axis, used condensed and in capitals) and labels are **JetBrains Mono**, both self-hosted from `@fontsource-variable/*`, not Google Fonts (no third-party request, the budget stays ours). The latin subsets are 90 KB and 40 KB of woff2; only the display font is preloaded.

**Album art (FR-ART-01) and motion (NFR-MOTION-01)** are new requirements; the album-art chain, its data-model change and the content-security-policy hosts are in spec section 10, and the motion rules are in section 5 and section 12.

## Confirmed on approval

1. **One Playwright test** (search, add, orbit) is added in the orbit pull request and runs in CI only. The wider Playwright suite stays in M4.
2. **The Deezer cover step is wired now** and gets its data from M4's preview lookup (FR-PREVIEW-01). No Deezer album lookup is pulled into M3R.
3. **Routes:** `/` is the landing page and `/graph?view=…&focus=song:<mbid>` the workspace; the spec's route list is updated.
4. **Legend chips (icon and name) are the role filters**, keyboard operable with `aria-pressed`, and each liner-notes card has "Remove from graph".
5. **`kind` on search results** is derived from MusicBrainz data first (release-group secondary types, then the recording's disambiguation comment) and only then from the title's decoration; the fallback is tested with real titles.
6. **A light scheme** is derived from the tokens and covered by the contrast tests; there is **no demo graph button** until the M4 seed.

## Changes from the prototype

| Prototype | This project | Why |
| --- | --- | --- |
| The legend names roles by colour only | Legend chips pair colour, an icon and the name, and are the role filters (`aria-pressed`) | NFR-A11Y-02; the prototype has no filter, but FR-HUB-03 stays |
| `role="img"` on the SVG that contains focusable nodes | `role="group"` with a name; nodes are buttons with a label that lists their roles | Children of `img` are presentational, so the nodes would not be reachable |
| Hover-only tooltip | Tooltip also on focus | Keyboard access |
| One `aria-live` region around the whole headline strip | A throttled status line ("Loading credits: n lookups waiting") | A live region that changes on every credit is noise for a screen reader |
| `prefers-reduced-motion` read once; CSS `animation: none` everywhere | A hook that follows the setting, and each animation has a still equivalent | NFR-MOTION-01; the live indicator should still tell the person something |
| Version expand animates `grid-template-rows` | Rows rise in with `opacity` and `transform`; the container is revealed at once | Only transform and opacity are animated (NFR-MOTION-01) |
| Input and button borders `#3B3E45` on `#101113` (about 1.7:1) | A stronger border token that meets 3:1 | WCAG 1.4.11 |
| "Open the demo graph" with fake credits | "Back to your graph" when a graph exists; no demo graph until the demo cache seed (M4) | There is no fake data in the app |
| "Loading credits 0/n" | "n lookups waiting" from `CrawlProgress` | The total is not known when a song is added (decision 0009) |
| Status "credits incomplete" for a song with no credits | M3's rules: the status chip is `complete`, `partial`, `none` or `loading` (decision 0015), and the "credits incomplete" badge is FR-GRAPH-04's (neither a producer nor a songwriter) | The two are different facts |
| No way to remove a song | A "Remove from graph" button on each liner-notes card and in the Text view | FR-GRAPH-01 |
| Light theme absent | Dark first as designed; a light scheme is derived from the same tokens and covered by the existing contrast tests | The M3 theme has both, and a toggle |
| D3 from a CDN as one bundle | Only the modules used, imported in a lazy chunk | The 250 KB first-load budget (decision 0002) |

## Alternatives considered

| Option | Why it lost |
| --- | --- |
| Keep the force canvas and restyle it | It is the thing the redesign replaces: a hairball cannot be read at 50 songs, whatever it is painted like |
| Orbit only, no constellation | Loses the overview and the "everything at once" moment; the constellation is cheap because the layout and canvas code exist |
| Constellation all SVG | Simplest and fully accessible, but the largest graph is a few thousand elements updated 60 times a second, which is the case NFR-PERF-03 exists for |
| Constellation all canvas | Reuses the most code, but gives up focusable nodes and real text where they matter most, at the sizes where SVG is fine |
| WebGL (for example a graph library) | Overkill for 600 nodes, a large dependency, and nothing to learn that the canvas path does not already teach |
| Port the prototype's script | It is template strings and global state; the app's data flow (TanStack Query, SignalR events into the cache, a reducer) must drive the views instead |

## Consequences

- **Two renderers** for the constellation to keep in step, behind one component and one data model; the threshold is a constant and a test runs both at the boundary.
- **A data-model and API change** for album art (spec section 8): the releases table gains the release group and its types, and the recording lookup asks MusicBrainz for `release-groups`. Existing rows are filled the next time a recording is fetched (NFR-REL-03's refresh); there is no bulk backfill.
- **The learning guide** for this work needs a guide id that the tools do not accept today (`LG-03R`); see spec section 16.
- **The Lighthouse check** (a 90 performance score on the home page) will run against the landing page from the first refresh pull request: fonts and the hero must keep it there.
- **No Playwright suite exists yet** (spec section 13 places it in M4). The refresh's end-to-end flow (search, add, orbit) needs one; see the open points in the pull request that proposes this record.

## Changes after the first screens were reviewed (2026-10-13)

The developer saw the landing page, results and sheet running, and reordered the rest of the work. Decided by the developer; recorded here so the spec and the pull requests agree.

| Before | Now | Why |
| --- | --- | --- |
| The orbit, then the cards and notes, in separate pull requests, with the M3 canvas and panels staying until pull request 5 | The whole `/graph` page is replaced in pull request 3: orbit, strip, legend filters, connector cards, liner notes, Text view; the M3 canvas page, left panel, details panel and tables are removed in it | The page should switch over in one go instead of showing half of each design |
| Pull request 4: constellation, cards, notes | Pull request 4: constellation and the toggle, the cards' FLIP and count-up, the new-credit highlight, "Find in your graph" | What is left once the page has switched |
| Removing a song was a button | FR-GRAPH-06: an exit animation and six seconds of undo; the request is sent when the time is up | A removal that cannot be taken back is hard to offer on a button in a card |
| Role filters were the only way to thin the views | FR-VIEW-03: "Hide from view" for one person, for the session, with a "n hidden · show" chip | One person can drown a graph (the artist is on every song), and a role filter is too blunt for that |
| The Playwright flow was search, add, orbit | Search, add, orbit, remove | The removal is the flow's one destructive step |
| Review by merging on green | Each UI pull request waits for the developer's "merge", with side-by-side screenshots of the prototype and the app at desktop and phone width and a list of every difference | Fidelity to the prototype is the bar |

Choices made inside the new items (open to change): the removal is **deferred** rather than undone by adding the song again, because the server then never holds a state the person did not mean and an undo needs no request; hidden people are kept in `sessionStorage` per graph; and the browser flow of pull request 3 runs the built web app with the Api and the hub faked at the network edge, because the end-to-end suite against the whole stack (with a recorded MusicBrainz) is M4's.
