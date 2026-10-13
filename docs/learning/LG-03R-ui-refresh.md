---
title: "LG-03R: The UI refresh"
milestone: "M3R"
release: "v0.3.1"
commit: "0000000000000000000000000000000000000000"
date: "2026-10-14"
---

# LG-03R: The UI refresh

> Status of this draft: sections 1 to 4 are written and checked against the code. Sections 5 to 12 are outlines for the
> developer to write (agreed on 2026-10-14); each says what it should cover. The build strips this note.

## 1. What was built

**Requirements delivered:** FR-LAND-01, FR-SEARCH-01, FR-SEARCH-02, FR-ART-01, FR-VIEW-01, FR-VIEW-02, FR-VIEW-03, FR-VIEW-04, FR-GRAPH-04, FR-GRAPH-05, FR-GRAPH-06, FR-HUB-01, FR-HUB-02, FR-HUB-03, FR-NOTES-01, NFR-A11Y-01, NFR-A11Y-02, NFR-MOTION-01, NFR-PERF-03

M3 ended with a graph that worked and was hard to read: at 50 songs the force-directed canvas was a knot. M3R replaced the whole front end with the design the developer made as a prototype (`docs/design/nodeable-ui-prototype.html`, decision 0020), in five pull requests that each ended on a review: tokens, fonts, role colours and album art (#28); the landing page and the add-a-song sheet (#29); the `/graph` workspace (#30); the constellation, the find box and the motion that was left (#31); and a pass over reduced motion, phones and dead code (#34).

What a person can do now that they could not before:

- **Land on a page that explains the product** and search from it, with the original recording first and its remasters, live takes and compilations folded behind it (FR-LAND-01, FR-SEARCH-01, FR-SEARCH-02).
- **See the whole graph as an orbit**: a hub with the number of songs, every song on the first ring as a record with its cover, and their people on the second, so songs that share nobody are all in view (FR-VIEW-04). Choosing a song or a person re-roots the orbit with an animated turn, and the breadcrumbs always lead back to "Your graph" (FR-VIEW-01).
- **Switch to the constellation**, the whole graph as a force layout that can be dragged and zoomed (FR-VIEW-02), and **find** any song or person by name (FR-GRAPH-05).
- **Read credits** in connector cards and liner notes beside the stage, with new credits highlighted as they arrive (FR-HUB-02, FR-NOTES-01).
- **Take things back**: remove a song and undo within six seconds (FR-GRAPH-06), or hide a person from the views for the session (FR-VIEW-03).
- **See covers**, from the Cover Art Archive by release, then by release group, then Deezer's album cover, then a generated sleeve (FR-ART-01).

Nearly all of it is front end. The server changed in two small ways that the covers needed: the `releases` table gained four columns for the release group (a migration, `ReleaseGroups`), and search results, graph songs and the `CreditsResolved` event carry the two ids the cover is looked up by.

Three things were learned the hard way, and each is in the spec because of it:

- **The canvas threshold was measured, not guessed.** The plan said SVG up to 250 nodes. Moving every node every frame in the app's own browser pane, an SVG of 100 nodes took 17 to 114 ms a frame and 250 took 165 ms, while a canvas took 6.9 ms from 100 to 500 nodes. The threshold is **60** (spec section 12).
- **Reduced motion needs a net, not just discipline.** Every animation of the app's own was written inside `prefers-reduced-motion: no-preference`, and a scan of the stylesheet still found five that were not. MUI's own components animate on their own, so the theme now ends every CSS animation and transition at once when the setting is on.
- **A phone check finds what a desktop review does not.** At 390 px the app bar took a third of the screen, wrapped names in the liner notes were targets 22 px apart, and the orbit's second-ring discs were 10 px wide and a few pixels from each other. Each node now has an invisible hit area of at least 24 px, and a ring that cannot hold them thins itself into "+N more".

First-load JavaScript is 169.5 KB gzipped (budget 250 KB); the workspace is a lazy chunk of 88.4 KB and the constellation another lazy chunk of 13.4 KB, loaded only when it is first shown.

## 2. Architecture slice

Only what M3R touched. The server side is unchanged except for the cover ids; everything below is in the browser.

```text
                  GET /graphs/{id}  (snapshot)         SignalR events (CreditsResolved, SongStatusChanged, ...)
                          │                                           │
                          ▼                                           ▼
                useLiveGraph ── TanStack Query cache, events merged by seq ──► snapshot
                                          │
        buildWorkspace(snapshot, role filters, pending removals, hidden people)    one derived model
                                          │
        ┌───────────────────┬─────────────┼────────────────┬──────────────────┐
        ▼                   ▼             ▼                ▼                  ▼
    OrbitView         ConstellationView  ConnectorCards  LinerNotes        TextView
    layoutOrbit()     LayoutController   FLIP reorder    new-credit        accessible
    OrbitMotion       SVG ≤ 60 nodes     count-up        highlight         tables of the
    (d3-timer)        canvas above       (WAAPI)         rising rows       same data
```

The order of a change, taking "a credit arrives for a song in the graph":

1. The Worker finishes a job and publishes `CreditsResolved`; the browser's hub connection hands it to `useLiveGraph`, which merges it into the cached snapshot (events at or below the snapshot's `seq` are dropped).
2. `GraphView` rebuilds the one `Workspace` from the snapshot, the role filters, the removals waiting out their undo and the hidden people. Every view reads that value, so they cannot disagree.
3. `OrbitView` lays the orbit out again (`layoutOrbit`, a pure function of the workspace, the centre and the stage size); `OrbitScene` gives the new layout to `OrbitMotion`, which moves each node from where it is to where it now goes. React renders the elements; the motion engine writes `transform` and `opacity` onto them.
4. `useFreshCredits` notices the new (song, person, role) and the liner notes highlight it for 1.6 seconds; the connector cards' order may change, and `useFlip` slides each card from its old place to its new one.
5. With reduced motion, steps 3 and 4 end in the same state at once: nodes are put in place, nothing is highlighted, cards are simply in their new order.

Covers do not go through the server:

```text
<img> ──► coverartarchive.org/release/{id}/front-250 ──404──► .../release-group/{id}/front-250 ──404──► Deezer cover ──► generated sleeve (SVG)
```

The Deezer step is wired in this milestone and has data from M4, when the preview lookup that supplies the cover is built.

## 3. Code map

Generated with `tools/learning/collect-anchors LG-03R`. Links point to the commit above, so they never go stale.
Do not edit between the two markers: `tools/learning/build` replaces the table with a fresh one pinned to the release commit every time the PDF is built.

<!-- code-map:start -->

| Anchor | File and lines | What it does | Concept it teaches |
| --- | --- | --- | --- |
| `placeholder` | `web/src/app/headerSlot.ts` | | |

<!-- code-map:end -->

## 4. Annotated walkthrough

Four of the fifteen anchors, chosen because each is a different way of getting a drawing onto a screen: a layout as a pure function, motion that bypasses React, a simulation whose output is not React state, and a target that is bigger than what is drawn.

### 4.1 `radial-tree`: an orbit is a tree whose x is an angle

`web/src/features/orbit/orbitLayout.ts`, lines 303 to 307, and 137 to 140:

```ts
  const root: TreeNode = { id: rootKey, kind: centre.type, ref: centre.id, children: rootChildren }
  const h = hierarchy(root)
  tree<TreeNode>()
    .size([Math.PI * 2, 1])
    .separation((a, b) => (a.parent === b.parent ? 1 : 1.6) / Math.max(1, a.depth))(h)

// ...

/** Polar (0 up, clockwise) to the SVG's cartesian coordinates around the centre. */
export function polarToXY(radius: number, angle: number): [number, number] {
  return [radius * Math.sin(angle), -radius * Math.cos(angle)]
}
```

- **`hierarchy(root)`** wraps the plain `TreeNode` data in nodes that know their `depth`, `parent` and `children`. Nothing here touches the DOM.
- **`.size([Math.PI * 2, 1])`** is the whole trick. `tree()` normally lays out a tree over a width and a height; giving it a width of 2π makes every node's `x` an angle in radians.
- **`.separation(...)`** says how far apart neighbours must be on that axis: 1 for siblings, 1.6 for nodes with different parents, divided by the depth. The division matters on a circle: the same angle is a longer arc on an outer ring, so the outer ring needs less of it.
- **The tree's own `y` is not used.** The radii come from the fit (`ratio1` and the bisection `fitBox`), because the stage's size decides how large the orbit can be. `tree()` supplies the angles; the orbit's size is decided somewhere else, and for the whole graph even the angles come from equal wedges, one per song (`wedgeAngles`).
- **Angle 0 points up and grows clockwise**, which is why `x` is `sin` and `y` is `-cos`; SVG's y axis points down.
- **Because `layoutOrbit` is a pure function** of the workspace, the centre and the stage size, `orbitLayout.test.ts` tests it without a DOM: the rings, the role arcs, that the tree fits the stage with no name under 12 px, and where each name sits.

### 4.2 `timer-driven-motion`: one clock, no React renders

`web/src/features/orbit/orbitMotion.ts`, lines 140 to 169 (abridged where marked):

```ts
    if (!animate) {
      this.duration = 1
      this.advance(Number.POSITIVE_INFINITY)
      return
    }

    this.duration = transitionMs
    this.clock = timer((elapsed) => this.advance(elapsed))
    // ...
    this.advance(0)
  }

  advance(elapsed: number): void {
    let done = true
    for (const node of this.nodes.values()) {
      const t = Math.min(1, Math.max(0, (elapsed - node.delay) / this.duration))
      if (t < 1) done = false
      const e = easeCubicInOut(t)
      node.cur.a = lerpAngle(node.from.a, node.tgt.a, e)
      node.cur.r = node.from.r + (node.tgt.r - node.from.r) * e
      // ... size and opacity
    }

    this.paint(this.nodes)
    if (!done) return

    this.clock?.stop()
```

- **`!animate` is reduced motion and resize, and it is the same code.** Time is set to infinity, so every `t` is 1 and every node is at its target; there is no second implementation of "the still version" to keep in step.
- **`timer(...)` is d3-timer**: one callback per animation frame with the milliseconds since it started. The motion is plain data (`from`, `tgt`, an easing of the elapsed fraction), advanced by that clock.
- **`this.paint(this.nodes)`** is a function the view passed in. `OrbitScene` writes `transform` and `opacity` onto SVG elements it keeps in a `Map` through refs; React is not involved per frame, so a transition costs no renders.
- **`this.clock?.stop()` when `done`.** A graph at rest runs no timer and costs no frames (NFR-PERF-03).
- **`lerpAngle`** (the `polar-interpolation` anchor) takes the short way round the circle, so a node that crosses the top turns a few degrees instead of swinging across the whole ring.

### 4.3 `layout-controller`: a simulation whose output is not React state

`web/src/features/constellation/LayoutController.ts`, lines 15 to 17, 47 to 57 and 76 (abridged where marked):

```ts
export class LayoutController {
  readonly positions = new Map<string, Position>()
  private readonly listeners = new Set<() => void>()
  // ...
      this.engine = createLayoutEngine(worker, {
        onPositions: (ids, xy) => {
          ids.forEach((id, index) => {
            const known = this.positions.get(id)
            if (known === undefined) this.positions.set(id, { x: xy[index * 2]!, y: xy[index * 2 + 1]! })
            else {
              known.x = xy[index * 2]!
              known.y = xy[index * 2 + 1]!
            }
          })
          for (const listener of this.listeners) listener()
        },
  // ...
      { rest: this.still },
```

- **`positions` is a `Map`, not state.** The force simulation reports positions many times a second; each report writes into the map and calls the subscribed paint functions. No component re-renders while the graph moves.
- **Two renderers, one layout.** The SVG renderer (up to 60 nodes) and the canvas renderer (above) both subscribe to the same controller, so a graph that crosses the threshold keeps its places.
- **`createLayoutEngine(worker, ...)`** chooses the page's thread or a Web Worker by size (`WORKER_NODE_THRESHOLD`, 500 nodes). The controller does not know which: the callbacks are the same.
- **`rest: this.still`** is reduced motion again: the layout is worked out to rest before it is first drawn, so nothing moves on screen.

### 4.4 `hit-areas`: a target is not what is drawn

`web/src/features/orbit/orbitLayout.ts`, lines 600 to 614 (abridged where marked):

```ts
function spreadRing(ring: OrbitNode[], radius: number): boolean {
  const n = ring.length
  if (n < 2) return true
  const turn = Math.PI * 2
  const order = ring.map((node) => ({ node, angle: ((node.angle % turn) + turn) % turn })).sort((a, b) => a.angle - b.angle)
  const start = order.map((entry) => entry.angle)
  const need = order.map((entry, index) => {
    const next = order[(index + 1) % n]!
    return 2 * Math.asin(Math.min(1, (entry.node.hit + next.node.hit) / (2 * radius)))
  })
  if (need.reduce((sum, value) => sum + value, 0) > turn - 1e-6) return false

  const pos = [...start]
  // ...
  for (let pass = 0; pass < 300; pass += 1) {
    // push each pair that is too close apart, half each way, until none is
  }
```

- **`node.hit`** is the radius of an invisible circle around the node: at least 12 px (24 px across, WCAG 2.2's 2.5.8) and never less than the drawn disc. The disc stays as the design has it; a press anywhere in the circle chooses the node.
- **`need`** is the angle at which two such circles just touch on a ring of this radius: a chord of `hit + hit` is `2 * asin((hit + hit) / (2 * radius))` of arc.
- **`> turn` means the ring cannot hold them.** Then `buildOrbit` asks the layout for fewer people on that ring (the rest become the ring's "+N more" node) and lays it out again; the caps only go down, so the loop ends. The whole graph's songs are never thinned (FR-VIEW-04), so there a crowded ring shrinks its areas to share the circle.
- **The pushing is a relaxation**: each pair that is too close moves apart by half the deficit each, repeated until nothing moves. It keeps the nodes in their order, so the role arcs, which group neighbours by role, are unchanged.
- **Where this is tested:** `orbitLayout.test.ts`, "hit areas", checks at a desktop and a phone width, at every kind of centre, that no node has less than 12 px and no two circles of a ring overlap; and the thinned ring and the unthinnable songs ring each have a test.

## 5. New concepts from a JavaScript point of view

*Outline for the developer to write.* A table, as in the template (Concept, In JavaScript / Node.js, In this code, Key difference), and one paragraph on the concept that felt least familiar. Candidates from this milestone's anchors:

- A React portal (`portal-header`): the header's find box and toggle are rendered by the workspace into a node owned by the shell.
- State derived while rendering instead of in an effect (`derived-state`), and `useSyncExternalStore` for `useReducedMotion`.
- Keeping an animation out of React (`react-structure-d3-motion`, `timer-driven-motion`), against what a Redux and React habit would do.
- `erasableSyntaxOnly` (`erasable-syntax`): what TypeScript syntax is gone, and why the constructor parameter property is the example.
- The Web Animations API for FLIP (`flip`), against CSS transitions and `requestAnimationFrame`.
- A class with a `Map` and listeners (`layout-controller`) as a small store, against a Redux or Zustand store.
- `prefers-reduced-motion` as a media query in CSS-in-JS (`reduced-motion-css`), and the theme's baseline.

## 6. Run it and break it

*Outline for the developer to write.*

- **Run it:** `dotnet run --project src/Nodeable.AppHost` (Docker running), then http://localhost:5173; what to click to see the orbit, the constellation, the find box, a re-root, the undo.
- **Tests that cover it:** list real test names from `web/src/features/orbit/orbitLayout.test.ts`, `web/src/features/graph/graph.test.tsx`, `web/src/motion/*.test.tsx` and `web/src/features/constellation/*.test.ts` (their names carry requirement IDs).
- **Break it on purpose** (three, each with the test that fails; check each one fails before writing it): for example, move an animation in a component out of its `prefers-reduced-motion: no-preference` block (`web/src/motion/motionCss.test.tsx`); change `minHit` in `orbitLayout.ts` to 6 (the hit-area test); change `CANVAS_THRESHOLD` (the constellation model test).

## 7. Read the trace

*Outline for the developer to write.* The server's spans did not change in this milestone (see LG-03 section 7 for adding a song). Decide what is worth showing: the browser span for adding a song with the same trace through the Api and the Worker, or the frame timings behind the 60-node threshold.

## 8. Decisions and trade-offs

*Outline for the developer to write.* A table (Decision, Alternatives considered, Why this one, Decision record). Rows to cover:

- The orbit and the constellation replace the force canvas; SVG up to 60 nodes, canvas above (`0020`).
- One `Workspace` that every view reads (`one-workspace`).
- The header's controls through a portal rather than lifting the state into the shell (`0020`, "Changes after the overview was built").
- Covers loaded by the browser with a four-step fallback, not through the Api (`image-fallback-chain`, spec section 10).
- Undo by delaying the DELETE rather than restoring it (`deferred-removal`).
- Reduced motion: guarded at the source, with a baseline and a test (`reduced-motion-css`, `0020`, "Changes after the pass").
- Hit areas of 24 px by nudging and thinning, with the whole graph's songs never thinned (`hit-areas`, `0020`).
- The app bar is sticky from 900 px up only (`0020`, "Changes after the pass").

## 9. Interview talking points

*Outline for the developer to write.* The 30-second version, the 2-minute version, a deep dive and a question with an answer. Material: why a radial tree, measuring the SVG-to-canvas threshold instead of guessing it, what "reduced motion" took beyond a media query, and the phone check.

## 10. Exercises

*Outline for the developer to write.* Three, with a hint each: a small extension (for example a second hover state on the constellation), a change that touches a new concept (for example a role filter that dims instead of hides), and a stretch (for example measuring frames on a phone, which was not measured in this milestone).

## 11. Further reading

*Outline for the developer to write.* Topics, with an official link for each and a line on why it is worth reading: d3-hierarchy's tree layout; WCAG 2.2 success criterion 2.5.8 (Target Size Minimum); `prefers-reduced-motion` on MDN; the FLIP technique; React's portals and `useSyncExternalStore`; the Web Animations API.

## 12. Check yourself

*Outline for the developer to write.* Ten short questions, answered before looking at the guide. Topics that earn a question: why the orbit's x is an angle; what the separation function divides by and why; what happens to the nodes when reduced motion is on; why the layout controller is not React state; what the threshold of 60 came from; how a hit area differs from a drawn disc; why the whole graph's songs are never thinned; what the theme's baseline covers that the component rules do not; how undo works without a restore endpoint; how a cover is chosen.
