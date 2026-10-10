# 0001. Lint the web app with ESLint and type-checked typescript-eslint

- **Status:** Accepted
- **Date:** 2026-10-09
- **Spec:** section 6 (TypeScript is a learning target), section 2 principles 6 and 7, NFR-A11Y-01

## Context

The `create-vite` template for M1 ships with oxlint. oxlint is very fast and needs almost no configuration, and it includes accessibility rules, but it has no type-aware rules. The spec makes TypeScript one of the main learning targets and requires WCAG 2.2 AA (principle 7), so the linter should teach TypeScript and enforce accessibility.

## Decision

Use **ESLint 9.39** with a flat config in `web/eslint.config.js`:

- `@eslint/js` recommended rules
- `typescript-eslint` `recommendedTypeChecked`, with `projectService` so rules can read real types
- `eslint-plugin-jsx-a11y` recommended
- `eslint-plugin-react-hooks` and `eslint-plugin-react-refresh`, to keep the React checks the oxlint setup had

The `lint` script is `eslint .`. oxlint is removed.

## Alternatives considered

| Option | Why it lost |
| --- | --- |
| Keep oxlint | Fast, but no type-aware rules, which are what teach TypeScript and catch un-awaited Promises or `any` leaking into typed code. |
| Biome | Fast and all-in-one, but its type-aware linting is still limited, and ESLint is the industry standard worth knowing for interviews. |
| ESLint 10 | `eslint-plugin-jsx-a11y` 6.10.2 only declares support up to ESLint 9. Forcing ESLint 10 would mean overriding a peer-dependency warning on the accessibility rules we most want to trust. |

## Consequences

- Linting is slower than oxlint because it asks the compiler for types (a few seconds, not milliseconds).
- typescript-eslint supports TypeScript below 6.1, so TypeScript stays on 6.0.x. Do not upgrade to TypeScript 7 until typescript-eslint supports it.
- `eslint-plugin-jsx-a11y` has not been released since October 2024. Revisit this decision if it blocks an upgrade to ESLint 10, or if a maintained fork becomes the standard.
- Rules that fire for the first time are explained in the learning guide (LG-01 section 5).
