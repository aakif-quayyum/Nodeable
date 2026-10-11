# 0011. The local database persists in a Docker volume

- **Status:** Accepted (implemented in M3, when the first graph needs to survive a restart)
- **Date:** 2026-10-11
- **Spec:** section 13 ("Local" deployment), principle 2 (fetch each external record once), principle 8 (reproducible), decision 0003

## Context

Each AppHost run starts an empty PostgreSQL, which was deliberate: nothing to configure. From M3 the user's graph and the crawled MusicBrainz data live in that database, and re-fetching costs real time because MusicBrainz allows about one request per second. Losing the data on every restart makes the development loop slow and repeats external requests that principle 2 asks us to avoid.

## Decision

- PostgreSQL in the AppHost gets a **named data volume**, and the superuser **password is generated once and remembered in the AppHost's user secrets**, so nothing is typed by hand and nothing is committed (NFR-SEC-01).
- A **documented reset command** removes the volume (and the stored password) to return to an empty database. It goes into the README.
- Migrations still apply at startup in Development (decision 0003), now on top of existing data.
- **Fallback:** if Aspire cannot remember a generated password between runs, the database stays ephemeral and a seed script (the demo-cache seed planned for M4) refills it.

## Alternatives considered

| Option | Why it lost |
| --- | --- |
| Ephemeral database plus a seed script (the fallback) | Reproducible, but a restart still means reloading. |
| A container that stays alive between runs | Fast restarts, but a half-broken container lingers between sessions and hides setup problems. |

## Consequences

- A volume plus a changed password is the classic way to get a database that will not start; the reset command and a short troubleshooting note in the README cover it.
- Whether Aspire persists a generated password is verified when this is implemented; if it does not, a parameter set once with `dotnet user-secrets` is the alternative, and the fallback above applies if that is too much friction.
- Integration tests are unaffected: they use their own Testcontainers databases.
