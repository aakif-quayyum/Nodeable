# 0013. Hold ESLint at 9, TypeScript at 6.0 and @types/node at the runtime's major, and review at each milestone

- **Status:** Accepted. The ESLint hold and the rejection of replacing the accessibility plugin are superseded by [0014](0014-eslint-10-and-jsx-a11y-x.md); the TypeScript hold and the `@types/node` rule still stand.
- **Date:** 2026-10-11 (amended the same day: `@types/node` added after Dependabot proposed version 26)
- **Spec:** decision 0001, principle 7 (accessibility), section 13 (CI)

## Context

Decision 0001 left two tools one major version behind on purpose. `eslint-plugin-jsx-a11y` declares support only up to ESLint 9, and typescript-eslint supports TypeScript below 6.1. Dependabot would keep proposing the newer majors, and each proposal would fail CI.

`@types/node` is a third case, with a different reason. It is the type declaration of the Node.js API, so its major version is meant to match the Node runtime the code runs on, not the newest Node release. CI runs Node 24 (`node-version: 24` in `.github/workflows/ci.yml`), while Dependabot proposed `@types/node` 26. Those types describe APIs Node 24 does not have, so code could compile and then fail at runtime.

## Decision

- **Stay on ESLint 9 and TypeScript 6.0** until the constraints above are lifted.
- **Dependabot ignores** the pinned majors: `eslint` and `@eslint/js` (major updates), and `typescript` (major and minor updates, because 6.1 is already outside typescript-eslint's range). Patch updates still flow.
- **Keep `@types/node` on the major of the Node runtime** (24 today). Dependabot ignores major updates for it; minor and patch updates still flow. When the runtime moves to a newer Node, change `node-version` in the workflow and move `@types/node` in the same pull request, lifting the ignore rule.
- **At the start of each milestone** the pins are reviewed: does `eslint-plugin-jsx-a11y` now declare ESLint 10, and does typescript-eslint support a newer TypeScript? Is Node 24 still the runtime in CI, so that `@types/node` 24 is still the matching major? If a pin can move, lift it in that milestone's first pull request.

## Alternatives considered

| Option | Why it lost |
| --- | --- |
| Force ESLint 10 and test the accessibility plugin | May work, but it overrides a peer-dependency warning on exactly the rules meant to protect users. |
| Replace the accessibility plugin | No clearly maintained replacement for the ESLint ecosystem could be confirmed. |
| Run oxlint beside ESLint for its built-in accessibility rules | Two linters to maintain. |
| Accept `@types/node` 26 and keep running Node 24 | The types would describe a newer API than the runtime has, so the compiler could pass code that fails when it runs. |
| Move the runtime to Node 26 instead | Changing the runtime is a decision of its own, not a side effect of a type update. |

## Consequences

- Upgrades are deliberate, not automatic, for these two tools.
- The ignore rules live in `.github/dependabot.yml` and name this decision, so removing them is a conscious step.
- `@types/node` follows one number, the `node-version` in the workflow, so there is one place to change when the runtime moves.
- The review is one line in the milestone start checklist (CLAUDE.md).

## Review log

### M2 start (2026-10-11)

| Question | Finding (checked against the npm registry and eslint.org on this date) |
| --- | --- |
| Does `eslint-plugin-jsx-a11y` declare ESLint 10? | No. Version 6.10.2 is the latest, published 2024-10-26, and its peer range stops at ESLint 9. |
| Does typescript-eslint support TypeScript 6.1 or later? | No. Version 8.71.1, and its canary build, accept `>=4.8.4 <6.1.0`. TypeScript's latest release is 7.0.2. |
| Is ESLint 9 still supported? | **No.** ESLint 9 reached end of life on 2026-08-06, before this decision was made; npm marks 9.39.5 as deprecated. ESLint 10 is the current line. |
| Is there a maintained accessibility plugin that supports ESLint 10? | One candidate: `eslint-plugin-jsx-a11y-x` 0.2.0 (published 2026-05-10 under the `es-tooling` organisation), a fork of `eslint-plugin-jsx-a11y` whose peer range is `^9 || ^10`. It is pre-1.0. |

Trial, in a scratch checkout, not committed: ESLint 10.12.0, `@eslint/js` 10.0.1 and `eslint-plugin-jsx-a11y-x` 0.2.0, with the plugin import and `configs.recommended` swapped in `web/eslint.config.js`. A file with an image without `alt`, a clickable `div` and an anchor with `href="#"` produced the same four findings as the current setup, and lint, typecheck and all 18 tests passed.

Outcome: the TypeScript pin stays. The ESLint pin **could** move, but only by replacing the accessibility plugin, which is the alternative rejected above when no maintained replacement could be confirmed. That premise has changed, so the choice is open and is put to the developer as a decision, not made as part of the milestone-start check.

### M3 start (2026-10-12)

| Question | Finding (checked against the npm registry and `.github/workflows/ci.yml` on this date) |
| --- | --- |
| Does typescript-eslint support TypeScript 6.1 or later? | No. Version 8.71.1 is the latest and its peer range is still `>=4.8.4 <6.1.0`. TypeScript's latest release is 7.0.2. The hold on TypeScript 6.0 stands. |
| Is Node 24 still the runtime in CI, so that `@types/node` 24 is the matching major? | Yes: `node-version: 24` in the CI and learning-guides workflows. `@types/node` 26.6.5 is the latest; its major still does not match the runtime. The rule stands. |
| Is `eslint-plugin-jsx-a11y-x` still being released? | It is alive but slow. 0.2.0 was published 2026-05-10; the release before it was 0.1.1 on 2025-05-21. Its peer range is `^9.0.0 \|\| ^10.0.0`, so ESLint 10 is supported. No action; the next review checks for a release since May. |

Outcome: no pin can move, so nothing is lifted in M3's first pull request.

### M4 start (2026-10-14)

| Question | Finding |
| --- | --- |
| Does typescript-eslint support TypeScript 6.1 or later? | No. Version 8.71.2 declares `<6.1.0`. The hold on TypeScript 6.0 stands. |
| Is Node 24 still the runtime in CI, so that `@types/node` 24 is the matching major? | Yes: CI runs Node 24, so `@types/node` stays on 24. |
| Is `eslint-plugin-jsx-a11y-x` still being released? | 0.2.0 is still the latest release. No action; it stays. |

Outcome: no pin can move, so nothing is lifted in M4's pull requests. Reviewed during M4, before PR 5; recorded 2026-10-16.
