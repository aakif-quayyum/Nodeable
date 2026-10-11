# 0013. Hold ESLint at 9 and TypeScript at 6.0, and review at each milestone

- **Status:** Accepted
- **Date:** 2026-10-11
- **Spec:** decision 0001, principle 7 (accessibility), section 13 (CI)

## Context

Decision 0001 left two tools one major version behind on purpose. `eslint-plugin-jsx-a11y` declares support only up to ESLint 9, and typescript-eslint supports TypeScript below 6.1. Dependabot would keep proposing the newer majors, and each proposal would fail CI.

## Decision

- **Stay on ESLint 9 and TypeScript 6.0** until the constraints above are lifted.
- **Dependabot ignores** the pinned majors: `eslint` and `@eslint/js` (major updates), and `typescript` (major and minor updates, because 6.1 is already outside typescript-eslint's range). Patch updates still flow.
- **At the start of each milestone** the pins are reviewed: does `eslint-plugin-jsx-a11y` now declare ESLint 10, and does typescript-eslint support a newer TypeScript? If so, lift the pin in that milestone's first pull request.

## Alternatives considered

| Option | Why it lost |
| --- | --- |
| Force ESLint 10 and test the accessibility plugin | May work, but it overrides a peer-dependency warning on exactly the rules meant to protect users. |
| Replace the accessibility plugin | No clearly maintained replacement for the ESLint ecosystem could be confirmed. |
| Run oxlint beside ESLint for its built-in accessibility rules | Two linters to maintain. |

## Consequences

- Upgrades are deliberate, not automatic, for these two tools.
- The ignore rules live in `.github/dependabot.yml` and name this decision, so removing them is a conscious step.
- The review is one line in the milestone start checklist (CLAUDE.md).
