# Nodeable

Nodeable is a music discovery web app that maps the producers, songwriters, engineers and session musicians behind the songs you love, then recommends new music through those people.

It is also a portfolio project, built to learn C#/.NET, TypeScript and modern observability tooling.

> **Status:** Milestone M1 (Foundations) in progress. Nothing is runnable yet.

## How it will run

One command starts the full stack locally (PostgreSQL, Redis, Api, Worker, the Vite dev server and the Aspire dashboard):

```bash
dotnet run --project src/Nodeable.AppHost
```

## Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download)
- [Node.js](https://nodejs.org/) 22.12 or newer
- [Docker](https://www.docker.com/products/docker-desktop/) (running)

## Documentation

- [Specification](docs/spec/nodeable-spec.md): the source of truth for every requirement
- [Decision records](docs/spec/decisions/): architecture decisions
- [Learning guides](docs/learning/): one guide per milestone
- [CLAUDE.md](CLAUDE.md): working rules for AI coding assistants
