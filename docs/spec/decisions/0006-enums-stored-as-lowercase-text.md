# 0006. Enum columns are lower-case text with CHECK constraints

- **Status:** Accepted
- **Date:** 2026-10-11
- **Spec:** section 8 (data model, `recording_people` view), principle 5 (honest data)

## Context

Several columns hold a fixed set of values: `credits_status`, `subject_type`, `role`, `source`, `provider`, and the crawl job `kind` and `status`. Section 8 lists them in lower case and its `recording_people` view compares against literals such as `'recording'`. EF Core stores a C# enum as an integer by default, which would make that SQL meaningless and rows unreadable in `psql`.

## Decision

- Enum values are stored as **lower-case text** through a value converter (`LowerCaseEnumConverter<TEnum>`): `CreditRole.Songwriter` is `'songwriter'`.
- Each column has a **CHECK constraint** generated from the enum's members, so the database rejects text that no member maps to.
- Names are `snake_case` for tables and columns (`EFCore.NamingConventions`), and MusicBrainz IDs are `uuid`.

## Alternatives considered

| Option | Why it lost |
| --- | --- |
| Integer enums (EF default) | Unreadable rows, and the section 8 SQL would need numeric literals tied to declaration order. |
| PostgreSQL native `ENUM` types | Adding a value needs a migration with `ALTER TYPE`, which cannot always run inside a transaction; text plus CHECK is easier to evolve. |
| Text without CHECK constraints | Any typo or stray value would be accepted silently. |

## Consequences

- Adding an enum member requires a migration that updates the CHECK constraint. The migration is generated, and a schema test catches a mismatch.
- Role `Other` exists in the database (unmapped MusicBrainz relationship types keep their raw type in `detail`), but the web UI has no colour or icon for it yet. That is an open question for M3.
