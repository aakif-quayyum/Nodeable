# 0002. Keep the 250 KB first-load budget; split by route and defer OpenTelemetry

- **Status:** Accepted
- **Date:** 2026-10-09
- **Spec:** section 12 (performance budgets), NFR-PERF-04, NFR-OBS-01, section 11 (browser traces)

## Context

Section 12 sets a budget of **250 KB gzipped JavaScript on first load**. A bare React 19 app already builds to 68.65 KB gzipped. MUI, its Emotion runtime, a router, TanStack Query and the OpenTelemetry web SDK all have to fit in the remaining space, and the OpenTelemetry web SDK is one of the heaviest. Raising the limit early would remove the pressure that keeps the app fast.

## Decision

1. **Keep the 250 KB budget unchanged for now.**
2. **Code-split by route.** Each route is loaded with `React.lazy` and a dynamic `import()`, so a page's code is fetched only when it is visited. D3 visualisations (v3) were already planned to load lazily.
3. **Load the OpenTelemetry web SDK after first paint**, with a dynamic `import()` started once the page has rendered, not in the main bundle.
4. **Measure at the end of M1** and report the numbers, split into two:
   - *initial JavaScript*: the entry chunk plus the chunks needed to render the home route;
   - *total on first visit*: initial plus the deferred OpenTelemetry chunk.
5. **If the budget is still exceeded, propose a spec change with those numbers.** The limit is not raised silently.

## Alternatives considered

| Option | Why it lost |
| --- | --- |
| Raise the budget now | Removes the constraint before we know whether it is needed. |
| Put OpenTelemetry in the main bundle | Simplest, and traces the very first request, but it adds the largest single cost to every visitor's first load. |
| Drop browser tracing | Breaks NFR-OBS-01, which requires a trace from browser click to external API call. |

## Consequences

- **Spans created before the SDK has loaded are lost.** A user who searches within the first moments after load may produce an untraced request. This is accepted for the saving, because the SDK normally finishes loading well before a user can type and submit a search. The end-to-end trace is verified in commit 16 of M1.
- **Section 12's wording needs clarifying.** "On first load" must say whether the deferred OpenTelemetry chunk counts. The end-of-M1 report decides this with measured numbers, and the clarification goes into the spec update at that point.
- Lazy routes need a loading fallback (React `Suspense`), which fits principle 3: never show a blank screen.
