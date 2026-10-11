# Nodeable

Nodeable is a music discovery web app that maps the producers, songwriters, engineers and session musicians behind the songs you love, then recommends new music through those people.

It is also a portfolio project, built to learn C#/.NET, TypeScript and modern observability tooling.

> **Status:** Milestone M1 (Foundations) is complete apart from its learning guide. The stack runs end to end and one request is traced from the browser through the Api to PostgreSQL. Search, the graph and recommendations arrive in M2 to M4; see the [roadmap](docs/spec/nodeable-spec.md#14-roadmap-and-tasks).

## Run it

One command starts PostgreSQL, Redis, the Api, the Worker, the web app and the Aspire dashboard:

```bash
dotnet run --project src/Nodeable.AppHost
```

- Open the dashboard at <http://localhost:15180>. The **web** row in its URLs column is the app: Aspire picks the port on every run.
- Reload the dashboard once if it first shows "0 resources".
- The database is ephemeral: each run starts empty and the Api applies the migrations.

## Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download)
- [Node.js](https://nodejs.org/) 22.12 or newer
- [Docker](https://www.docker.com/products/docker-desktop/), **running** (the AppHost and the integration tests start containers)

## Test and check

```bash
dotnet test                                   # backend; needs Docker
cd web && npm test                            # frontend
cd web && npm run lint && npm run typecheck   # frontend checks
cd web && npm run gen:api                     # regenerate TypeScript types from the Api's OpenAPI document
dotnet format Nodeable.slnx --verify-no-changes
```

The same checks run in GitHub Actions on every pull request.

## Documentation

- [Specification](docs/spec/nodeable-spec.md): the source of truth for every requirement
- [Decision records](docs/spec/decisions/): architecture decisions
- [Learning guides](docs/learning/): one guide per milestone
- [CLAUDE.md](CLAUDE.md): working rules for AI coding assistants
