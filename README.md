# Nodeable

Nodeable is a music discovery web app that maps the producers, songwriters, engineers and session musicians behind the songs you love, then recommends new music through those people.

It is also a portfolio project, built to learn C#/.NET, TypeScript and modern observability tooling.

> **Status:** Milestones M1 (Foundations), M2 (Ingestion) and M3 (the graph interface) are released as v0.1.0, v0.2.0 and v0.3.0. You can search for a song, add it to a graph, and watch its credits arrive; people credited on more than one song become hubs you can filter by role. Discovery and recommendations (M4) are next. See the [roadmap](docs/spec/nodeable-spec.md#14-roadmap-and-tasks).

## Run it

One command starts PostgreSQL, Redis, the Api, the Worker, the web app and the Aspire dashboard:

```bash
dotnet run --project src/Nodeable.AppHost
```

- Open the dashboard at <http://localhost:15180>. The **web** row in its URLs column is the app: Aspire picks the port on every run.
- Reload the dashboard once if it first shows "0 resources".
- The database persists in a Docker volume (`nodeable-postgres-data`), so graphs and crawled MusicBrainz data survive a restart. The Api applies new migrations on top of it.

### Resetting the local database

Stop the AppHost (Ctrl+C), then:

```bash
node tools/dev/reset-local-db.mjs --yes
```

This removes the volume and any container still using it; the next run starts empty. Without `--yes` it only shows what it would remove. The database password is generated once and remembered in the AppHost's user secrets, so it needs no attention. If the database refuses to start with "password authentication failed" after you cleared those secrets, reset it with the command above.

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
