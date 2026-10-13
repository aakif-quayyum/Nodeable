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
- The **constellation is SVG up to a node threshold and canvas above it.** The graph can reach 50 songs and about 550 people, and an SVG with a few thousand elements whose attributes change on every simulation tick is where phones slow down. The canvas path is what M3 already built and measured: `GraphLayout` (with the Web Worker above 500 nodes), the quadtree hit test and `drawGraph`, restyled to the new tokens. The threshold started at **250 nodes** and is a constant; the pull request that built the SVG constellation measured it, and it is **60** (see "Changes after the overview was built" below and spec section 12).
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

## Changes after the workspace was reviewed (2026-10-13)

The developer added two unrelated songs to the workspace of pull request 3 and gave five findings. Decided by the developer; the spec (sections 4 and 12) says what is built.

| Finding | Now | Why |
| --- | --- | --- |
| Two unrelated songs could only be seen one at a time | FR-VIEW-04: the default centre is **the whole graph**, a hub labelled with the number of songs, every song on the first ring with its cover and their people on the second; the first breadcrumb, "Your graph", always goes back | The workspace is about the graph; a song is a place to go into from it |
| The orbit rendered small in a large stage | The layout is **fitted to the stage**: the largest radius at which every disc and name fits the free part of the stage, nodes and names that grow with the room, names never under 12 px, refitted on resize and on every re-root | A fixed radius leaves a large stage empty; names that cannot be read are not labels |
| It was not obvious that a role filter was on | FR-HUB-03: a bar under the headline names what is shown or hidden and says the counts follow it, with "Show all roles"; a chip toggles its role (it never solos it) | A state that changes every number should not live only in a struck-through chip at the bottom of the stage |
| The first liner-notes card's header was cut off when the column scrolled | The two headings of the column stick to its top on an opaque background | Cards slide under a heading instead of under the container's edge |
| A song with no credits was a dot with small print | Its cover large at the centre and, in 17 px type, "No credits on MusicBrainz yet · Add them" | The empty state is the song's whole view; it should say what is wrong and what to do |

Choices made inside these (open to change):

- **The fit is a bisection over the box the tree really fills**, not a closed-form radius: a disc's size and a name's length do not scale with the radius, so there is no formula, and a bisection on a monotonic function takes 28 steps over at most a few hundred points. The tree is then centred in the free box, so a tree whose names all point up is moved down instead of being made smaller to leave room below.
- **Names get the room their own node has**: a second-ring name runs outward along the radius to the stage's edge, so it is long on the sides and short at the top and bottom, where the stage is shortest. A name is cut with an ellipsis; on a small stage the second ring has none (the tooltip and the accessible name give them).
- **Adding a song still puts the orbit on that song**, so its crew can be watched arriving; "Your graph" is the first breadcrumb and one click away.
- **Covers are the labels of the records** in the orbit, drawn as an SVG `<image>` with the same source chain as the cards. The no-referrer rule for cover images (NFR-PRIV-01) became a page-level `<meta name="referrer">`, because an SVG `<image>` has no `referrerPolicy` prop in React.

## Changes after the overview was built (2026-10-13)

The constellation, the toggle and "Find in your graph" were built in pull request 4. Two things differ from what this record planned, and two came from the developer's review of the workspace.

| Planned or asked | Now | Why |
| --- | --- | --- |
| The SVG constellation up to **250 nodes**, a canvas above | SVG up to **60 nodes**, a canvas above | The measurement this record asked for: in the app's own browser pane an SVG of 100 nodes with a transform written on every frame took 17 to 114 ms a frame (a 144 Hz display allows 6.9) and 250 nodes took 165 ms, while a canvas took 6.9 ms from 100 to 500 nodes and 7.9 ms at 1000. SVG held 30 frames a second only to about 80 nodes. The table is in spec section 12 |
| Zoom 0.45 to 3 times | 0.2 to 3 times | The fitted picture of a large graph can be smaller than 0.45, and the wheel would jump it up to the limit on the first tick |
| Names cut to the room, chosen by the developer's first reading | Whole when they fit, wrapped at a word into two lines before any cut, cut at a word, whole on hover and focus | "William Ear…" and "Me and Y…" read as errors; a person should not have to hover to read a name that had room |
| A chip is not in the plan | "n songs not connected · Your graph" on the stage while a song or person is the centre | After a song or a person is chosen the rest of the graph was out of sight, and the only way back was the first breadcrumb |

Choices made inside these (open to change):

- **The toggle and the find box are rendered into the app bar by the workspace through a portal** (a context carries the bar's element), not owned by the shell. The shell would otherwise need the graph's snapshot, the view and the centre, none of which it should know. The cost is that they exist only while the workspace is mounted, which is when they are wanted.
- **One `LayoutController` holds the positions outside React** and both renderers subscribe to it, so SVG and canvas read the same layout and a settled graph that crosses the threshold keeps its places. Dragging is a `pin` and a `release` on the layout (a message to the worker above 500 nodes).
- **The forces are the prototype's**, not M3's: M3's were tuned for squares and small discs, and the prototype's give records room and let a crew gather round its song.
- **`d3-drag` is a direct dependency** (it was only a dependency of `d3-zoom`), with its types in the dev dependencies.

## Changes after the pass (2026-10-14)

Pull request 5 went over every animation and every view at phone width. What it changed, and why:

- **A reduced-motion baseline in the theme**, so MUI's own animations are covered without wrapping each component, and a test that reads the stylesheet and fails on the app's own animation or transition declared outside `no-preference`. The first run found five of the app's rules (hover transitions of the cards and notes, the constellation's focus fades, the button's transition).
- **Names in the liner notes are 24 px targets** (WCAG 2.2, 2.5.8): found at 390 px, where wrapped names sat 22 px apart.
- **The orbit's second-ring nodes stay 10 px on a phone**, which fails 2.5.8 on its own; recorded as an exception because the same action is on four controls that pass (spec section 12, "Phone check").
- **The M3 canvas page's model code is gone** (`deriveGraph` and three helpers): the constellation builds its graph from the workspace.
