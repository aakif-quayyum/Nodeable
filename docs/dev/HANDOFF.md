# Handoff: where Nodeable stands

Written 2026-10-16 so a new session can continue without the conversation that produced it. The working rules are in `CLAUDE.md`; the spec is `docs/spec/nodeable-spec.md`. Check every status below against `gh pr list` and `git log` before relying on it.

## Where we are

- **v0.3.1 is released** (M3 and the M3R UI refresh). **M4 (Discovery and launch) is in progress**, target tags `v0.4.0` at the end of M4 and `v1.0.0` when it is live.
- **Tool-version review done (2026-10-14, logged in decision 0013):** the TypeScript pin stays (typescript-eslint 8.71.2 declares `<6.1.0`), `@types/node` stays on 24 (CI runs Node 24), `eslint-plugin-jsx-a11y-x` stays on 0.2.0 (latest). No pin can move in M4.

## M4 pull request plan

| # | PR | Status |
|---|----|--------|
| docs | M4 plan changes: USD 0 hosting on Oracle (ADR 0024), no Grafana, built-in rollup plus ECharts status page (ADR 0023) | merged #36 |
| 1 | Deezer previews by ISRC and a guarded title-and-artist match (ADR 0025) | merged #37 |
| 1b | Title-and-artist length window 10 s | merged #38 |
| ci | gitleaks secret scan over the whole history | merged #39 |
| 2 | Previews in the app (plain player, Deezer cover art) | merged #40 |
| 2b | Pick the right version of a preview (ADR 0026, Accepted) | merged #41 |
| 3 | Waveform player (Deezer CORS re-checked from the page origin) | merged #42 |
| sec | MessagePack 2.5.303 for GHSA-qhrr-8q5h-9q3h | merged #45 |
| 4 | Person drawer (FR-PERSON-01) | merged #44 |
| docs | FR-SAMPLE-01 "Built from" (v2) approved, ADR 0027 Accepted | merged #43 |
| docs | M4-start tool-version review recorded (decision 0013) | merged #47 |
| test | Lazy-chunk waits put back to 5 s / 10 s, chunks preloaded in the three test files that open them | this PR |
| 5 | Recommendations (FR-REC-01, 02), cache only | next after #44 is merged |
| 6 | 30-day refresh with Hangfire + Hangfire.PostgreSql (dashboard dev-only); backfills ISRCs and previews for pre-M4 songs | not started |
| 7 | Rollup, status API, health, daily SLO check | not started |
| 8 | `/status` page and About with ECharts | not started |
| 9 | CI arm64 images, image scan, OpenAPI diff | not started |
| 10 | Oracle deployment (re-read Oracle Always Free limits first) | not started; needs the developer's account, keys and subdomain, plus the D7 seed albums |
| 11 | Playwright end-to-end and k6 | not started |
| 12 | LG-04 learning guide (all 12 sections, claims checked against code) and `v0.4.0` | not started |

FR-SAMPLE-01 is **v2 and must not be built** until the developer approves #43 and says so.

## Open pull requests

None besides the PR that carries this update.

## Settled decisions (D1 to D8, 2026-10-14)

- D1 store Deezer `cover_md5`.
- D2 person drawer from "Details" and Enter; orbit click still re-roots; years labelled partial.
- D3 recommendations from cache only; exclude songs already in the graph.
- D4 Hangfire + Hangfire.PostgreSql; dashboard dev-only.
- D6 repo goes public before launch after a secret scan. The scan is done (gitleaks clean); **the developer flips visibility**. History is not rewritten.
- D7 propose 8 to 10 seed albums **before PR 10**, with measured credit counts: include Childish Gambino "Awaken, My Love!", a Kanye West album, and Benson Boone or LISA if their credits are good.
- D8 tag `v0.4.0` at the end of M4 and `v1.0.0` when live.
- ADR 0023 proposals accepted: Basic auth by the Api for the status endpoints, each process flushes its own metric deltas and the Worker flushes the rest, Better Stack free uptime monitor.
- **PR 5 tie-break:** more hubs on the candidate, then more of the graph's songs shared by those hubs, then title A to Z. Record it in the spec when PR 5 is built.
- Picks of a preview version (ADR 0026) must need sign-in or admin approval **before launch**; this is a launch condition recorded in the spec.

## Open items and pending decisions

- **WhoSampled URL pattern:** the developer's message contained the literal placeholder "[paste what you saw]". The pattern is unrecorded and is carried as an open item in spec §15 and ADR 0027. Ask the developer for the real search URL; do not guess it. The developer is emailing WhoSampled; any use of their data needs written permission.
- **Genius is not used.** Its terms (updated 2026-01-13) rule out copying, displaying or deriving from its data without written consent. The measurement was deliberately not taken. SecondHandSongs is academic-only and Discogs' API is restricted, so MusicBrainz plus a WhoSampled link-out is the whole plan for "Built from".
- **GitHub noreply email:** the developer will give their address; then remind them of the exact command, `git config user.email "<id>+<username>@users.noreply.github.com"` (run in the repo, not `--global` unless they want it everywhere). Existing commits stay as they are.
- **Domain / subdomain for the Oracle deployment** (PR 10): developer to provide.
- **Seed albums (D7):** proposal due before PR 10.
- **Open question in spec §15:** evaluate Apple's iTunes Search API as a second preview source (rate limits, terms, CORS on its audio for the waveform). Research only.
- **Sparse data:** the sparse-data risk for "Built from" (9 of 20 sample-heavy songs have a MusicBrainz item) is recorded in the spec's risk table.

## Known flaky tests and what has been tried

- **Lazy chunks under load (fixed, 2026-10-16).** The Playwright suite already runs against a production build (`vite preview`), so it never had the problem; the Vitest jsdom tests import source through Vite's transform and cannot use a build. With the waits back at 5 s / 10 s the full suite failed on `spin.test.tsx` (first findByRole of the constellation), so the cause was the first transform of the lazy module graph under parallel load, not a render problem. `web/src/test/lazyChunks.ts` preloads the graph view and constellation in `beforeAll` of `spin.test.tsx`, `graph.test.tsx` and `motionCss.test.tsx`; five full-suite runs passed. If it fails again, preload in the file that fails; do not raise the waits.
- **Backend CI job hung 20 minutes once** in the Infrastructure tests (#41), not reproduced. `tests/Shared/xunit.runner.json` sets `longRunningTestSeconds` 60, linked into the Infrastructure and Api test projects, so a hang now names the test.
- **A jsdom test passed with a real bug present** (the pick dialog re-asked Deezer in a loop; `gcTime: 0` query re-created per render). Found only in a real browser; prefer a real-stack check for query-lifecycle behaviour.

## Only in the assistant's memory (now also recorded here)

- Local dev quirks on Windows: Docker Desktop is not running by default (start it, poll `docker info`); stop processes by command line (`Get-CimInstance Win32_Process`), not the nohup PID; Aspire's Postgres password is generated (`docker exec <c> printenv POSTGRES_PASSWORD`); the Worker reads `appsettings.json` from the current directory, so run it from `src/Nodeable.Worker`; MusicBrainz throttles by IP so space manual requests out; in Git Bash write scripts with an editor tool, not heredocs with apostrophes or backslash paths; never start a command with `python -` (it waits on stdin).
- Stopping the stack: kill AppHost, Api, Worker and Vite by command line, then `docker rm -fv` the Nodeable containers. Keep the `nodeable-postgres-data` volume (`node tools/dev/reset-local-db.mjs --yes` removes it). Two stopped containers named `postgres-qgzaeeqr` and `redis-yupgvtfj` are the developer's own: leave them.
- Deezer: a miss is HTTP 200 with error 800; signed preview URLs expire after about 15 minutes; refresh never overwrites a `user_pick`.
- `gh pr edit` fails on this repo (classic Projects GraphQL); use `gh api -X PATCH repos/aakif-quayyum/Nodeable/pulls/N -F body=@file`.
- Merge conflicts in the spec's decision log and §14 have been both-sides rows each time: keep both.
- UI review loop: UI PRs wait for "merge", the stack stays up on port 5173, and each UI PR shows a screenshot.
