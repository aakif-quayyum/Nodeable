# 0010. The `other` role is shown with a neutral style, labelled from its detail

- **Status:** Accepted (implemented in M3, with the graph UI)
- **Date:** 2026-10-11
- **Spec:** section 8 (role `other`), section 10 (role mapping), section 12 (role colours and icons), FR-HUB-03, principle 5, NFR-A11Y-02

## Context

MusicBrainz has many relationship types and the app maps six to roles. Everything else is stored as role `other` with the raw type in `detail` (for example "arranger" or "conductor"), so nothing is lost. The UI has six colours and icons and none for `other`, so without a decision those credits would disappear or render with a broken style, which breaks principle 5.

## Decision

- `other` is shown in a **neutral grey** with a **generic icon** (a tag-like glyph). It is a seventh entry beside the six, in the same role definitions file.
- Wherever a credit is shown (the person drawer, the list view, tooltips) the label comes from `detail`: "Arranger", not "Other".
- It has its own role-filter chip, **on by default**, so nothing is hidden unless the user hides it.
- People with `other` credits count towards hubs like any other credited person (FR-HUB-01 counts songs a person is credited on, whatever the role).
- Colour is never the only signal (NFR-A11Y-02): the icon and the text label carry the meaning, and the grey is covered by the same contrast test (at least 3:1 on both backgrounds).

## Alternatives considered

| Option | Why it lost |
| --- | --- |
| Hide `other` behind a filter that starts off | Cleaner graph, but people vanish unless the user knows to look (principle 5). |
| Promote common types to first-class roles now (arranger, conductor, orchestrator) | Widens the palette and the design before there is real data to show which types matter. |

## Consequences

- Revisit promoting frequent types to their own roles once the cache holds real data (a count of `detail` values among `other` credits will show which).
- The grey must stay visually distinct from the six, so it cannot be one of the accent colours.
