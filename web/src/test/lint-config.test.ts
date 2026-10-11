import { resolve } from 'node:path'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

// ESLint 10 and eslint-plugin-jsx-a11y-x replaced ESLint 9 and eslint-plugin-jsx-a11y (decision 0014). A plugin that
// silently stopped applying would make `npm run lint` pass on inaccessible markup, so this test lints known-bad and
// known-good files with the real project configuration and checks the findings.
//
// The ESLint API is the same engine as the command line: new ESLint({ ... }) reads web/eslint.config.js, and
// ignore: false lets it lint the fixtures that the config ignores for the normal `npm run lint`.
const eslint = new ESLint({ cwd: resolve(import.meta.dirname, '../..'), ignore: false })

async function lint(file: string) {
  const [result] = await eslint.lintFiles([file])
  return result?.messages ?? []
}

describe('NFR-A11Y-01 accessibility lint rules', () => {
  it('flags the four deliberate violations, as errors', async () => {
    const messages = await lint('src/test/fixtures/inaccessible.tsx')

    // Any parse failure would have a null ruleId and break this equality, so a broken config cannot pass by accident.
    expect(messages.map((m) => m.ruleId).sort()).toEqual([
      'jsx-a11y-x/alt-text',
      'jsx-a11y-x/anchor-is-valid',
      'jsx-a11y-x/click-events-have-key-events',
      'jsx-a11y-x/no-static-element-interactions',
    ])
    expect(messages.every((m) => m.severity === 2)).toBe(true)
  }, 60_000)

  it('reports nothing for the corrected markup', async () => {
    const messages = await lint('src/test/fixtures/accessible.tsx')

    expect(messages).toEqual([])
  }, 60_000)
})
