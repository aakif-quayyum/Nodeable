// Run with: node --test "tools/ci/*.test.mjs"
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { checkCoverage, parsePackages } from './check-coverage.mjs'

// The shape the Microsoft code coverage extension writes (trimmed to the package elements).
const report = `<?xml version="1.0" encoding="utf-8"?>
<coverage line-rate="0.9" branch-rate="1" version="1.9">
  <packages>
    <package line-rate="0.82" branch-rate="0.5" complexity="10" name="Nodeable.Domain">
      <classes />
    </package>
    <package line-rate="0.40" branch-rate="0" complexity="3" name="Nodeable.Other">
      <classes />
    </package>
  </packages>
</coverage>`

describe('parsePackages', () => {
  it('reads the name and rates of every package', () => {
    assert.deepEqual(parsePackages(report), [
      { name: 'Nodeable.Domain', lineRate: 0.82, branchRate: 0.5 },
      { name: 'Nodeable.Other', lineRate: 0.4, branchRate: 0 },
    ])
  })
})

describe('checkCoverage', () => {
  it('passes at or above the minimum', () => {
    assert.equal(checkCoverage(report, 'Nodeable.Domain', 80).ok, true)
    assert.equal(checkCoverage(report, 'Nodeable.Domain', 82).ok, true)
  })

  it('fails under the minimum and says by how much', () => {
    const result = checkCoverage(report, 'Nodeable.Domain', 90)
    assert.equal(result.ok, false)
    assert.match(result.message, /82\.0% line coverage/)
  })

  it('looks only at the named assembly', () => {
    assert.equal(checkCoverage(report, 'Nodeable.Other', 80).ok, false)
  })

  it('fails when the assembly is missing, so a rename cannot silently disable the gate', () => {
    const result = checkCoverage(report, 'Nodeable.Missing', 80)
    assert.equal(result.ok, false)
    assert.match(result.message, /not in the coverage report/)
  })
})
