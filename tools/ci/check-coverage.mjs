// Fails when the line coverage of one assembly in a Cobertura report is under a minimum (spec section 13, CI step 2).
//
//   node tools/ci/check-coverage.mjs <report.xml> <assembly name> <minimum percent>
//   node tools/ci/check-coverage.mjs coverage/domain.cobertura.xml Nodeable.Domain 80
//
// Cobertura is the XML format the Microsoft code coverage extension writes with `--coverage-output-format cobertura`.
// Line coverage is used because it is the figure the report gives per assembly; branch coverage is printed for information.
import { appendFileSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/**
 * Reads the per-assembly figures from a Cobertura report.
 * @param {string} xml
 * @returns {{ name: string, lineRate: number, branchRate: number }[]}
 */
export function parsePackages(xml) {
  const packages = []
  for (const match of xml.matchAll(/<package\s+([^>]*)>/g)) {
    const attributes = Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]))
    if (attributes['name'] === undefined || attributes['line-rate'] === undefined) continue
    packages.push({
      name: attributes['name'],
      lineRate: Number(attributes['line-rate']),
      branchRate: Number(attributes['branch-rate'] ?? 0),
    })
  }
  return packages
}

/**
 * @param {string} xml
 * @param {string} assembly
 * @param {number} minimumPercent
 */
export function checkCoverage(xml, assembly, minimumPercent) {
  const found = parsePackages(xml).find((p) => p.name === assembly)
  if (!found) {
    // A renamed or missing assembly must fail loudly: a gate that finds nothing and passes protects nothing.
    return { ok: false, message: `Assembly "${assembly}" is not in the coverage report.` }
  }
  const percent = found.lineRate * 100
  const ok = percent >= minimumPercent
  return {
    ok,
    percent,
    message: `${assembly}: ${percent.toFixed(1)}% line coverage (branches ${(found.branchRate * 100).toFixed(1)}%), minimum ${minimumPercent}%`,
  }
}

function main() {
  const [report, assembly, minimum] = process.argv.slice(2)
  const minimumPercent = Number(minimum)
  if (!report || !assembly || !Number.isFinite(minimumPercent)) {
    console.error('Usage: node tools/ci/check-coverage.mjs <report.xml> <assembly name> <minimum percent>')
    process.exit(2)
  }

  const result = checkCoverage(readFileSync(report, 'utf8'), assembly, minimumPercent)
  console.log(result.message)

  if (process.env['GITHUB_STEP_SUMMARY']) {
    appendFileSync(process.env['GITHUB_STEP_SUMMARY'], `### Coverage gate\n\n${result.ok ? 'Passed' : 'Failed'}: ${result.message}\n`)
  }
  if (!result.ok) {
    console.error(`::error::${result.message}`)
    process.exit(1)
  }
}

// Run the CLI only when executed directly, not when the tests import the functions above.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
