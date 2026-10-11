# 0008. Partial MusicBrainz dates keep a precision column

- **Status:** Accepted (implemented in M2, with the MusicBrainz client)
- **Date:** 2026-10-11
- **Spec:** section 8 (`recordings.first_release_date`, `releases.date`), principle 5 (honest data), FR-SEARCH-01, FR-SEARCH-02

## Context

MusicBrainz often knows only a year (`1995`) or a year and month (`1995-03`). The tables use full `date` columns, so a year-only value would be stored as 1 January and shown as a precise date nobody recorded. FR-SEARCH-02 also collapses duplicates behind the "earliest official release", so a made-up day affects which release wins.

## Decision

- Keep the `date` column and add a **precision** column next to it: `recordings.first_release_date_precision` and `releases.date_precision`, with values `year`, `month` or `day` (lower-case text with a CHECK constraint, as in decision 0006).
- A partial date is stored as its **earliest possible day** plus its precision: `1995` becomes `1995-01-01` with `year`, and `1995-03` becomes `1995-03-01` with `month`.
- The precision is null exactly when the date is null (a CHECK constraint says so).
- Sorting and "earliest" use the `date` column, so ordering stays simple. The UI formats by precision: "1995", "March 1995" or "14 March 1995". Search results show the year.

## Alternatives considered

| Option | Why it lost |
| --- | --- |
| Raw text plus a derived year | Always honest, but ordering by full date is awkward and error-prone. |
| Three nullable numbers (year, month, day) | Exact, but every sort and comparison becomes clumsy. |
| Keep `date` and accept "1 January" | Simplest, and quietly wrong (principle 5). |

## Consequences

- One new migration in M2 adds the two columns. There is no production data yet, so it costs nothing now.
- The Domain gets a `DatePrecision` enum, and API responses that carry a date carry its precision.
- Two dates with the same stored day but different precision compare as equal; that is acceptable for "earliest release" because the precision difference does not change which year or month is earliest.
