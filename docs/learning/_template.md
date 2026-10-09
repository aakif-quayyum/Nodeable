---
title: "LG-xx: <Guide name>"
milestone: "Mx"
release: "<git tag, e.g. v0.1.0>"
commit: "<full commit SHA the code map links point to>"
date: "YYYY-MM-DD"
---

# LG-xx: <Guide name>

> How to use this template: copy it to `docs/learning/LG-xx-<name>.md`.
> Sections 1 to 4 can be drafted by an AI assistant from the `LEARN:` anchors and the milestone diff.
> Sections 5 to 11 are yours to write or rewrite in your own words: writing them is where the learning happens.
> Delete these instruction notes before building the PDF.

## 1. What was built

**Requirements delivered:** FR-xxx-00, NFR-xxx-00

<One paragraph: what a user or reviewer can now do that they could not before, and which parts of the system changed.>

## 2. Architecture slice

<A small diagram or ordered list showing only the components this milestone touched, and how one request flows through them.>

```text
Browser ──► Api ──► PostgreSQL
              └──► crawl_jobs ──► Worker ──► MusicBrainz
```

## 3. Code map

Generated with `tools/learning/collect-anchors LG-xx`. Links point to the commit above, so they never go stale.

| Anchor | File and lines | What it does | Concept it teaches |
| --- | --- | --- | --- |
| `<short-id>` | [`src/Nodeable.Api/Program.cs#L10-L24`](<permalink>) | | |
| | | | |

## 4. Annotated walkthrough

Pick the 3 to 5 most important anchors. For each:

### 4.1 <Anchor short-id>: <what it does>

```csharp
// Short excerpt, 10 to 30 lines at most
```

- **Line x:** why it is written this way.
- **Line y:** what would break if it were different.

## 5. New concepts from a JavaScript point of view

| Concept | In JavaScript / Node.js | In this code | Key difference |
| --- | --- | --- | --- |
| Example: async work | `async`/`await` with Promises | `async Task<T>` | Tasks can run on thread-pool threads; `CancellationToken` is passed explicitly |
| | | | |

<A short paragraph on the one concept from this milestone that felt least familiar, explained in your own words.>

## 6. Run it and break it

**Run it:**

```bash
dotnet run --project src/Nodeable.AppHost
```

**Tests that cover it:** `<test names, which carry requirement IDs>`

**Break it on purpose:**

1. Change: <a deliberate one-line change>
2. Expected failure: <which test fails, or what the trace shows>
3. What it teaches: <one sentence>

## 7. Read the trace

<Screenshot of the trace in the Aspire dashboard.>

| Span | What happened | Typical duration |
| --- | --- | --- |
| | | |

## 8. Decisions and trade-offs

| Decision | Alternatives considered | Why this one | Decision record |
| --- | --- | --- | --- |
| | | | `docs/spec/decisions/<file>.md` |

## 9. Interview talking points

- **30-second version:** <what it is and why it matters>
- **2-minute version:** <the main flow and one interesting problem>
- **Deep dive:** <the hardest part, what you tried, what you would do at 100x scale>
- **A question they might ask, and your answer:**

## 10. Exercises

Attempt these without looking anything up first.

1. <Small extension> · Hint: <one line>
2. <A change that touches a new concept> · Hint: <one line>
3. <Stretch> · Hint: <one line>

## 11. Further reading

- [<Official doc title>](<url>): <why it is worth reading>
