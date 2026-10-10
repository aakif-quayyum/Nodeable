# 0005. The API contract is generated at build time and checked in CI

- **Status:** Accepted
- **Date:** 2026-10-11
- **Spec:** principle 6 (typed end to end), section 9 (OpenAPI document), section 13 (CI step 3)

## Context

Principle 6 says API types are generated from the OpenAPI contract, not written by hand. Three details needed deciding: where the document comes from without a running server, whether the generated types are committed, and how numbers are described. ASP.NET Core's default JSON settings also accept numbers written as strings, so its OpenAPI output described every number as "integer or string", and the generated TypeScript type was `number | string`.

## Decision

1. **The document is written on every build** of the Api (`Microsoft.Extensions.ApiDescription.Server`, `OpenApiGenerateDocuments`, output under `obj/openapi`). It is also served at `/openapi/v1.json` (section 9).
2. **`npm run gen:api`** builds the Api and runs `openapi-typescript` to produce `web/src/api/schema.d.ts`. The generated file **is committed**, so the frontend builds and tests without a .NET toolchain.
3. **CI regenerates the file and fails on any difference** (`api-contract` job). A contract change must arrive in the same pull request as its updated types.
4. **JSON numbers are strict** (`JsonNumberHandling.Strict`), so the schema says `integer` or `number`, and `null` is `number | null`. Unmeasured values are `null`, never `0` (principle 5).
5. The client is `openapi-fetch`, generic over the generated `paths`, and test fixtures are typed with the generated schema, so a changed response fails compilation.

## Alternatives considered

| Option | Why it lost |
| --- | --- |
| Generate types from a running Api | Needs the stack up (database, containers) just to build the frontend. |
| Do not commit the generated file | Every contributor and CI job needs .NET to type-check the web app, and reviewers cannot see contract changes in a diff. |
| Hand-written API types | Breaks principle 6; the two halves drift silently. |
| Keep the default number handling | The generated type becomes `number \| string` and the typed contract is meaningless. |

## Consequences

- `openapi-typescript` declares `typescript ^5.x`; an npm `overrides` entry satisfies the peer with TypeScript 6.0. It is a build-time tool, so the risk is low.
- The OpenAPI **diff against `main`** for breaking changes (section 13 step 3, an M4 task) is a separate, later check; this decision only guarantees the committed types match the current Api.
- Adding an endpoint means: change the Api, run `npm run gen:api`, commit both.
