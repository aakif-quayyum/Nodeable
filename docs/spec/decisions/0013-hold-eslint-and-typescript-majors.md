# 0013. Hold ESLint at 9, TypeScript at 6.0 and @types/node at the runtime's major, and review at each milestone

- **Status:** Accepted
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
