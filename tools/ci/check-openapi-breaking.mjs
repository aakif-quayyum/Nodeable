// Fails when the Api's contract has a breaking change that the version number does not admit (spec section 13, CI step 3).
//
//   node tools/ci/check-openapi-breaking.mjs <base openapi.json> <head openapi.json>
//
// The rule: a change that breaks an existing client (a removed path or field, a new required parameter, a narrower type)
// passes only when the document's info.version differs from the base's. Changing the number is the deliberate act of
// shipping a breaking change; ApiContract.Version in the Api is where it is edited. Everything else passes.
//
// The comparison is done by oasdiff, run from its official image at a fixed version, as gitleaks is: no action to trust.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const oasdiffImage = 'tufin/oasdiff:v1.33.0'

/**
 * Whether the head document is allowed to break the base's contract: its info.version is a different string.
 * @param {string} baseJson
 * @param {string} headJson
 * @returns {{ allowed: boolean, base: string | undefined, head: string | undefined }}
 */
export function versionChange(baseJson, headJson) {
  const base = JSON.parse(baseJson)?.info?.version
  const head = JSON.parse(headJson)?.info?.version
  return { allowed: head !== undefined && head !== base, base, head }
}

function main() {
  const [basePath, headPath] = process.argv.slice(2)
  if (basePath === undefined || headPath === undefined) {
    console.error('Usage: node tools/ci/check-openapi-breaking.mjs <base openapi.json> <head openapi.json>')
    process.exit(2)
  }

  // The first pull request that adds the contract file has nothing to compare with.
  if (!existsSync(basePath)) {
    console.log(`No ${basePath}: the base branch has no committed contract yet, so there is nothing to compare.`)
    return
  }

  const base = resolve(basePath)
  const head = resolve(headPath)
  const run = (...args) =>
    spawnSync(
      'docker',
      ['run', '--rm', '-v', `${dirname(base)}:/base:ro`, '-v', `${dirname(head)}:/head:ro`, oasdiffImage, ...args],
      { encoding: 'utf8', env: { ...process.env, MSYS_NO_PATHCONV: '1' } },
    )
  const basePathInContainer = `/base/${base.split(/[\\/]/).pop()}`
  const headPathInContainer = `/head/${head.split(/[\\/]/).pop()}`

  // What changed, for the log, whatever the verdict.
  const changelog = run('changelog', basePathInContainer, headPathInContainer)
  console.log(changelog.stdout || '(no changes in the contract)')
  if (changelog.status !== 0) {
    console.error(changelog.stderr)
    process.exit(changelog.status ?? 1)
  }

  const breaking = run('breaking', basePathInContainer, headPathInContainer, '--fail-on', 'ERR')
  console.log(breaking.stdout)
  if (breaking.status === 0) {
    console.log('No breaking change.')
    return
  }

  const { allowed, base: before, head: after } = versionChange(readFileSync(base, 'utf8'), readFileSync(head, 'utf8'))
  if (allowed) {
    console.log(`The contract has breaking changes, and info.version changed from ${before} to ${after}: allowed.`)
    return
  }

  console.error(
    `::error::The Api's contract has a breaking change and info.version is still ${after}. Change ApiContract.Version in src/Nodeable.Api/ApiContract.cs (a major bump) to ship it on purpose, or make the change compatible.`,
  )
  process.exit(1)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
