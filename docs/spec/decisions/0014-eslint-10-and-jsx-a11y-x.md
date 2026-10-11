# 0014. Move to ESLint 10 and replace the accessibility plugin with eslint-plugin-jsx-a11y-x

- **Status:** Accepted. Supersedes the ESLint and accessibility-plugin parts of decisions [0001](0001-eslint-with-typescript-eslint.md) and [0013](0013-hold-eslint-and-typescript-majors.md). The TypeScript hold and the `@types/node` rule in 0013 still stand.
- **Date:** 2026-10-11
- **Spec:** decision 0001, decision 0013, principle 7 (accessibility), NFR-A11Y-01

## Context

Decision 0013 held ESLint at 9 because `eslint-plugin-jsx-a11y` declares support only up to ESLint 9, and rejected replacing the plugin because no maintained replacement could be confirmed. The review at the start of M2 (log in 0013) changed both premises:

- **ESLint 9 reached end of life on 2026-08-06**, before 0013 was written. npm marks every 9.x release deprecated. It gets no further fixes.
- **`eslint-plugin-jsx-a11y` has had no release since 2024-10-26.** Its peer range stops at ESLint 9, so it will not unblock ESLint 10 on its own.
- **A maintained fork exists.** `eslint-plugin-jsx-a11y-x` 0.2.0 (MIT, published 2026-05-10, repository `eslint-community/eslint-plugin-jsx-a11y-x`, last push 2026-10-06) declares ESLint `^9 || ^10`. Its npm release carries a SLSA provenance attestation. It is small (56 stars at the time of writing) and pre-1.0.

## Decision

- **ESLint 10.12 and `@eslint/js` 10.0.1** replace ESLint 9.
- **`eslint-plugin-jsx-a11y-x` replaces `eslint-plugin-jsx-a11y`.** `web/eslint.config.js` uses its `configs.recommended`. Rule names now start with `jsx-a11y-x/` instead of `jsx-a11y/`.
- **The dependency range is `^0.2.0`.** For a 0.x package a caret accepts patch releases only, so each new minor version arrives as a Dependabot pull request that CI checks, not silently.
- **Dependabot no longer ignores `eslint` and `@eslint/js` majors.** The `typescript` ignore (major and minor) and the `@types/node` ignore stay.
- **A regression test guards the plugin.** `web/src/test/lint-config.test.ts` lints a file with four deliberate violations using the project's real ESLint configuration and expects exactly those four findings as errors, then lints the corrected file and expects none. A plugin that silently stopped applying would otherwise let `npm run lint` pass on inaccessible markup.
- **TypeScript stays at 6.0.** typescript-eslint accepts TypeScript `>=4.8.4 <6.1.0` (its canary build too), and TypeScript's latest release is 7.0.2.

## Evidence

| Check | Result |
| --- | --- |
| The plugins' `recommended` configurations, compared rule by rule | 34 rules each; the severity and options of all 34 are identical, only the prefix differs |
| Four deliberate violations (an image without `alt`, a clickable `div`, an anchor with `href="#"`) | The same four findings from both plugins: `alt-text`, `click-events-have-key-events`, `no-static-element-interactions`, `anchor-is-valid` |
| The regression test with the plugin line removed from the configuration | Fails, with no findings reported |
| `npm run lint`, `npm run typecheck`, `npm test` (20 tests), `npm run build`, first-load budget | All pass; first-load JavaScript unchanged at 150.9 KB of 250 KB |
| `npm audit --audit-level=high` | 0 vulnerabilities |

## Alternatives considered

| Option | Why it lost |
| --- | --- |
| Stay on ESLint 9 | End of life, so no fixes, and the original plugin has stopped releasing. The hold buys nothing now. |
| Use the original plugin on ESLint 10 and override the peer warning | It might work today, but it overrides a declared constraint on the rules meant to protect users, and nothing maintained stands behind it. |
| Drop accessibility linting and rely on axe checks in the Playwright suite (M4) | Those find problems late and only on pages a test visits; lint feedback is at edit time. Both are wanted. |
| Run oxlint beside ESLint for its built-in accessibility rules | Two linters to maintain, which 0001 and 0013 already rejected. |

## Consequences

- **The plugin is a small, pre-1.0 project.** If it stops being maintained, the fallbacks are the original plugin pinned with ESLint 9 (end of life) or oxlint's accessibility rules. The regression test makes a switch cheap to verify.
- **Rule names changed.** Any `eslint-disable` comment or rule override must use the `jsx-a11y-x/` prefix. There are none in the repository today.
- **The milestone-start check shrinks.** It now asks whether typescript-eslint supports a newer TypeScript, whether `@types/node` still matches the runtime, and whether the accessibility plugin is still releasing.
- **Decision 0013's Dependabot comment and ESLint wording are history.** Its review log stays as the record of how this decision was reached.
