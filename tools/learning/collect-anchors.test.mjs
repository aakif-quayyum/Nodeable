// Run with: node --test tools/learning
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { findDuplicates, parseAnchors, renderMarkdown } from './collect-anchors.mjs'

describe('parseAnchors', () => {
  it('reads a C# or TypeScript comment and describes the code under it', () => {
    const text = [
      'namespace X;',
      '',
      '// LEARN: LG-01 service-defaults | One shared project holds telemetry setup',
      'public static class Extensions',
      '{',
      '    public static void Add() { }',
      '}',
      '',
      'other();',
    ].join('\n')

    const { anchors, problems } = parseAnchors(text, 'src/Extensions.cs')

    assert.deepEqual(problems, [])
    assert.equal(anchors.length, 1)
    assert.deepEqual(anchors[0], {
      guide: 'LG-01',
      id: 'service-defaults',
      explanation: 'One shared project holds telemetry setup',
      file: 'src/Extensions.cs',
      line: 3,
      code: 'public static class Extensions',
      endLine: 7,
    })
  })

  it('reads a one-line XML comment and strips the closing marker', () => {
    const text = '<!-- LEARN: LG-01 central-packages | Versions live in one file -->\n<PropertyGroup />'

    const { anchors } = parseAnchors(text, 'Directory.Packages.props')

    assert.equal(anchors[0]?.explanation, 'Versions live in one file')
    assert.equal(anchors[0]?.code, '<PropertyGroup />')
  })

  it('reads an anchor inside a multi-line XML comment and skips the closing line', () => {
    const text = ['<Project>', '  <!--', '    LEARN: LG-01 build-props | Shared by every project', '  -->', '  <PropertyGroup>', '  </PropertyGroup>'].join('\n')

    const { anchors } = parseAnchors(text, 'Directory.Build.props')

    assert.equal(anchors[0]?.line, 3)
    assert.equal(anchors[0]?.code, '<PropertyGroup>')
  })

  it('reports a LEARN comment that is not in the required format', () => {
    const text = ['// LEARN: this is missing the guide and id', '// LEARN: LG-1 bad-guide | two digits are required'].join('\n')

    const { anchors, problems } = parseAnchors(text, 'src/Bad.cs')

    assert.equal(anchors.length, 0)
    assert.deepEqual(problems.map((problem) => problem.line), [1, 2])
  })

  it('handles Windows line endings', () => {
    const { anchors } = parseAnchors('// LEARN: LG-02 rate-gate | atomic\r\nvar x = 1;\r\n', 'a.cs')

    assert.equal(anchors[0]?.explanation, 'atomic')
    assert.equal(anchors[0]?.code, 'var x = 1;')
  })
})

describe('findDuplicates', () => {
  it('flags the same guide and id used in two places, but not the same id in different guides', () => {
    const make = (guide, id, file) => ({ guide, id, file, line: 1, explanation: '', code: '', endLine: 1 })

    const duplicates = findDuplicates([make('LG-01', 'a', 'x.cs'), make('LG-01', 'a', 'y.cs'), make('LG-02', 'a', 'z.cs')])

    assert.equal(duplicates.length, 1)
    assert.deepEqual(duplicates[0]?.map((anchor) => anchor.file), ['x.cs', 'y.cs'])
  })
})

describe('renderMarkdown', () => {
  it('links to the pinned commit with a line range and escapes pipes in table cells', () => {
    const anchors = [{ guide: 'LG-01', id: 'x', file: 'src/A.cs', line: 10, endLine: 14, code: 'a | b', explanation: 'c | d' }]

    const table = renderMarkdown(anchors, { repo: 'o/r', ref: 'abc123' })

    assert.match(table, /\[`src\/A\.cs#L10-L14`\]\(https:\/\/github\.com\/o\/r\/blob\/abc123\/src\/A\.cs#L10-L14\)/)
    assert.match(table, /`a \\\| b`/)
    assert.match(table, /c \\\| d/)
  })
})
