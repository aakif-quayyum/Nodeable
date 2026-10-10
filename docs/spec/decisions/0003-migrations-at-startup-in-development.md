# 0003. Apply EF Core migrations at Api startup in Development only

- **Status:** Accepted
- **Date:** 2026-10-11
- **Spec:** section 13 ("migrations run as a separate one-off step before the Api starts"), principle 8 (reproducible)

## Context

Section 13 says production runs EF Core migrations as a separate one-off step. Locally, principle 8 asks for one command that starts the whole stack, and a fresh PostgreSQL container has no tables, so something must create them. The usual Aspire answer is a dedicated migration-service project, which is not in the section 13 repository layout.

## Decision

- In the **Development** environment the Api calls `Database.MigrateAsync()` once at startup, before it maps endpoints.
- The Worker waits for the Api (`WaitFor(api)` in the AppHost), so it never races the migration.
- In **production** the Api never migrates. Migrations run as the separate one-off step section 13 describes.
- The check is `app.Environment.IsDevelopment()`. Integration tests rely on it too: the test factory runs the Api in Development against an empty Testcontainers database.

## Alternatives considered

| Option | Why it lost |
| --- | --- |
| A separate migration-service project in the AppHost | The Aspire-recommended pattern, but one more project outside the section 13 layout for a one-person project. |
| Migrate on startup in every environment | Several Api instances would race to migrate, and a bad migration would take the service down as it starts. |
| Run `dotnet ef database update` by hand | Breaks "one command starts the stack" (principle 8). |

## Consequences

- On a brand-new database EF logs one Error-level line while it probes for the missing `__EFMigrationsHistory` table, before creating it. This is expected first-run noise.
- Local databases are ephemeral: each AppHost run starts a fresh PostgreSQL, because a persistent volume would need a pinned password, which would break the "nothing to configure" rule. Revisit when a graph needs to survive a restart (M3).
- The production migration step (a migration bundle run before the new Api image starts) is still to be written in M4.
