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
- Before writing code for a task, give a short plan: files to create or change, and which requirement IDs they satisfy. Wait for approval on anything larger than a single task.
- Write tests with the code (spec section 13). Backend tests never call the real MusicBrainz API; use WireMock.Net recordings.
- Never exceed external rate limits. All MusicBrainz calls go through the shared rate gate (spec sections 5 and 10).
- Every new endpoint, job and external call is traced (spec section 11).
- Keep secrets out of the repository. Use .NET user secrets locally.

## Learning anchors (spec section 16)

At every key point in the code, add a comment in this exact format:

```
// LEARN: LG-xx <short-id> | <one-line explanation of the concept>
```

Use the guide ID for the current milestone (LG-01 for M1, LG-02 for M2, and so on). Aim for 8 to 15 anchors per milestone, on the code that teaches something: patterns, framework features, non-obvious decisions. Not on boilerplate.

## Definition of done for a milestone

1. All tasks checked off in spec section 14, tests green.
2. LEARN anchors added.
3. Learning guide drafted at `docs/learning/LG-xx-<name>.md` from `docs/learning/_template.md`: sections 1 to 4 drafted from the anchors and diff; sections 5 to 11 left as outlines for the developer to write.
4. Spec updated with anything learned, and a decision record added for any significant choice.
5. The learning guide PDF is a deliverable, not an extra:
   - the "Learning guides" workflow builds it from the guide's Markdown (as an artifact on pull requests), so the pull request that finishes a milestone must show a green PDF build;
   - when the milestone is tagged (`vX.Y.Z`), the same workflow attaches every guide PDF to that tag's GitHub release, with the code map links pinned to the tagged commit.
   Pandoc is not installed on the developer's machine: PDFs are built by the workflow, not locally. Do not ask the developer to install it.

## Commands

- Run everything: `dotnet run --project src/Nodeable.AppHost` (Docker must be running)
- Backend tests: `dotnet test`
- Frontend tests: `cd web && npm test`
- Regenerate the web app's API types: `cd web && npm run gen:api`
- Check LEARN anchors (format and unique ids): `node tools/learning/collect-anchors.mjs --check`
- Code map for a guide: `tools/learning/collect-anchors LG-xx` (PowerShell: `node tools/learning/collect-anchors.mjs LG-xx`)
- Build a learning guide PDF: `tools/learning/build LG-xx`. This needs Pandoc and WeasyPrint, which only the CI runner has; locally use `--prepare-only` to check the Markdown the PDF is built from.
- Finalise a guide: `tools/learning/build LG-xx --write` updates the committed Markdown's code map and `commit` field so it matches the PDF. Run it once, when the guide is finished and just before tagging, never on every commit (the table would change in every diff).
