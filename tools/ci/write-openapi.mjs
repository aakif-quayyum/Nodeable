// Writes the Api's OpenAPI document, which every build of Nodeable.Api produces, to the committed contract file (spec section 13).
//
//   node tools/ci/write-openapi.mjs
//
// The committed copy (docs/api/openapi.json) is what a pull request is compared with: CI regenerates it and fails when it
// differs from what is committed, and compares it with the base branch's copy to find breaking changes. The file is parsed
// and written again with two-space indentation and a final newline, so the bytes do not depend on the machine that built it
// (the build writes the document with the line endings of its operating system).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const source = resolve(root, 'src/Nodeable.Api/obj/openapi/Nodeable.Api.json')
const target = resolve(root, 'docs/api/openapi.json')

/** The document as it is committed: stable indentation, LF line endings, a final newline. */
export function normalise(json) {
  return `${JSON.stringify(JSON.parse(json), null, 2)}\n`
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, normalise(readFileSync(source, 'utf8')))
  console.log(`Wrote ${target}`)
}
