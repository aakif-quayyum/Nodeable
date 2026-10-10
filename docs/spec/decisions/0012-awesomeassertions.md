# 0012. Backend assertions use AwesomeAssertions

- **Status:** Accepted (packages added in M2, with the first role-mapping tests)
- **Date:** 2026-10-11
- **Spec:** section 6, section 13 (test layers), principle 1 (acceptance tests)

## Context

Section 13 named FluentAssertions, the library that reads `result.Should().Be(5)`. From version 8 it is under a commercial licence (free only for non-commercial use). This is a portfolio project that may be shown in job applications, which is a grey area. Backend tests so far use plain xUnit `Assert`, which is fine for simple checks and awkward for collections and objects.

## Decision

- Use **AwesomeAssertions**, a community fork of FluentAssertions 7 under the Apache-2.0 licence, with the same fluent syntax.
- Section 13's test layer table names it instead of FluentAssertions.
- It is added to the backend test projects in M2, when role mapping and scoring create the first tests that benefit. Existing `Assert` tests are left alone.

## Alternatives considered

| Option | Why it lost |
| --- | --- |
| FluentAssertions 8 | The best-known name, with the licence question above. |
| FluentAssertions 7 | The last Apache-2.0 version, but frozen with no further fixes. |
| Shouldly | Free, but a different syntax from the spec and most tutorials. |
| Plain xUnit `Assert` | No dependency, but verbose for collections and objects. |

## Consequences

- The syntax matches what tutorials and interviews use (`.Should()`), so the learning transfers.
- If the fork's maintenance lapses, swapping the assertion library is a mechanical change.
