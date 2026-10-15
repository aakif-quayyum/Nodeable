# Nodeable

Nodeable is a music discovery web app that maps the producers, songwriters, engineers and session musicians behind songs a user loves. It is also a portfolio project, built to learn C#/.NET, TypeScript and modern observability tooling.

## Source of truth

- The spec lives at `docs/spec/nodeable-spec.md`. Read the relevant sections before any task.
- Every change implements a requirement ID from the spec (for example `FR-GRAPH-02`, `NFR-RATE-01`). Name it in the commit message and the test name.
- If a task needs behaviour the spec does not describe, stop and propose a spec change first. Do not invent requirements.
- Architecture decision records go in `docs/spec/decisions/`, one Markdown file per decision.

## About the developer

- Strong in JavaScript, React, Redux, Node.js, PostgreSQL, ClickHouse and D3.
- New to C#, .NET, TypeScript, Aspire, EF Core, SignalR and Terraform.
- When writing C# or TypeScript, briefly explain any idiom that has no direct JavaScript equivalent.
- Prefer clear, idiomatic code over clever code. This code will be studied and explained in interviews.

## Working rules

- Work one milestone at a time (spec section 14). Do not start the next milestone's tasks early.
- At the start of each milestone, review the held tool versions (decisions 0013 and 0014): can TypeScript move up (does typescript-eslint support 6.1 or later?), is `@types/node` still the major of the Node runtime in CI, and is `eslint-plugin-jsx-a11y-x` still being released? If a pin can move, lift it in that milestone's first pull request.
- Before writing code for a task, give a short plan: files to create or change, and which requirement IDs they satisfy. Wait for approval on anything larger than a single task.
- Write tests with the code (spec section 13). Backend tests never call the real MusicBrainz API; use WireMock.Net recordings.
- Never exceed external rate limits. All MusicBrainz calls go through the shared rate gate (spec sections 5 and 10).
- Every new endpoint, job and external call is traced (spec section 11).
- Keep secrets out of the repository. Use .NET user secrets locally.

## Standing rules for how we work together

- **Start here in a new session:** read `docs/dev/HANDOFF.md` (state, open PRs, open items, flaky tests), then the spec sections the task needs.
- **Pull requests:** one feature branch per PR, merge commits, requirement ID in the commit message and test name. Open PRs push-notify the developer. Docs-only PRs say so; UI PRs show a screenshot (`docs/learning/images/`), backend-only PRs say so.
- **Never merge until the developer says "merge".** Only exceptions: a security patch bump (green CI, no code changes; tell them afterwards) and a PR they have explicitly told you to merge on green. Check CI and PR state live (`gh`), never from memory.
- **Local stack:** `dotnet run --project src/Nodeable.AppHost`, web pinned to port **5173**. For UI PRs keep it running for hot reload and hand over the URL plus 3 things to try. "pause" means stop the AppHost, Api, Worker, Vite and the containers (`docker rm -fv`, keep the `nodeable-postgres-data` volume); "resume" starts them again.
- **Tests:** run only targeted tests locally (`-class` for a backend test class, `npm test -- <file>` for the web); CI runs the whole suite. Docker Desktop must be running for Testcontainers.
- **Stop for decisions:** anything that needs a choice, a spec requirement change or a new ADR goes to the developer first. Spec edits that only record what was built are fine.
- **Git history is not rewritten** (tags and guide permalinks depend on it). Future commits use the developer's GitHub noreply address once they give it; then remind them of the exact `git config user.email` command.
- **Recommendations tie-break (PR 5, FR-REC-01):** more hubs on the candidate, then more of the graph's songs shared by those hubs, then title A to Z. Cache only; exclude songs already in the graph. Record it in the spec when PR 5 is built.
- **Previews:** MusicBrainz is the only credit source; Genius is **not used** (terms). WhoSampled is a link-out only, never fetched, and any use of their data needs written permission.

## Learning anchors (spec section 16)

At every key point in the code, add a comment in this exact format:

```
// LEARN: LG-xx <short-id> | <one-line explanation of the concept>
```

Use the guide ID for the current milestone (LG-01 for M1, LG-02 for M2, and so on; `LG-03R` for the M3 UI refresh, an ID may carry one capital letter for a revision). Aim for 8 to 15 anchors per milestone, on the code that teaches something: patterns, framework features, non-obvious decisions. Not on boilerplate.

## Definition of done for a milestone

1. All tasks checked off in spec section 14, tests green.
2. LEARN anchors added.
3. Learning guide written in full at `docs/learning/LG-xx-<name>.md` from `docs/learning/_template.md`. The assistant writes every section: 1 to 11 and the "Check yourself" quiz (section 12). The developer reviews it; nothing is left as an outline.
   - Section 5 compares every new C#, .NET or TypeScript idea with its JavaScript and Node.js equivalent, in plain words, because JavaScript is the developer's reference point.
   - Every technical claim in the guide is checked against the actual code before the guide is finalised: file paths, test names, versions, numbers and links.
4. Spec updated with anything learned, and a decision record added for any significant choice.
5. The learning guide PDF is a deliverable, not an extra:
   - the "Learning guides" workflow builds it from the guide's Markdown (as an artifact on pull requests), so the pull request that finishes a milestone must show a green PDF build;
   - when the milestone is tagged (`vX.Y.Z`), the same workflow attaches every guide PDF to that tag's GitHub release, with the code map links pinned to the tagged commit.
   Pandoc is not installed on the developer's machine: PDFs are built by the workflow, not locally. Do not ask the developer to install it.

## Commands

- Run everything: `dotnet run --project src/Nodeable.AppHost` (Docker must be running)
- Backend tests: `dotnet test`
- Frontend tests: `cd web && npm test`
- Domain coverage gate (CI runs it; needs no Docker): `dotnet test --project tests/Nodeable.Domain.Tests --coverage --coverage-output-format cobertura --coverage-output coverage/domain.cobertura.xml`, then `node tools/ci/check-coverage.mjs coverage/domain.cobertura.xml Nodeable.Domain 80`
- Regenerate the web app's API types: `cd web && npm run gen:api`
- Check LEARN anchors (format and unique ids): `node tools/learning/collect-anchors.mjs --check`
- Code map for a guide: `tools/learning/collect-anchors LG-xx` (PowerShell: `node tools/learning/collect-anchors.mjs LG-xx`)
- Build a learning guide PDF: `tools/learning/build LG-xx`. This needs Pandoc and WeasyPrint, which only the CI runner has; locally use `--prepare-only` to check the Markdown the PDF is built from.
- Finalise a guide: `tools/learning/build LG-xx --write` updates the committed Markdown's code map and `commit` field so it matches the PDF. Run it once, when the guide is finished and just before tagging, never on every commit (the table would change in every diff).
