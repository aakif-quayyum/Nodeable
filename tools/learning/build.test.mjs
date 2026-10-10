// Run with: node --test "tools/learning/*.test.mjs"
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CODE_MAP_END, CODE_MAP_START, prepareGuide, setFrontMatter, stripForPdf } from './build.mjs'

const guide = [
  '---',
  'title: "LG-01: Foundations"',
  'release: "<git tag, e.g. v0.1.0>"',
  'commit: "<full commit SHA>"',
  'date: "2026-10-11"',
  '---',
  '',
  '# LG-01: Foundations',
  '',
  '## 3. Code map',
  '',
  CODE_MAP_START,
  '',
  '| old | table |',
  '',
  CODE_MAP_END,
  '',
  '## 4. Walkthrough',
].join('\n')

describe('setFrontMatter', () => {
  it('replaces an existing key and leaves the other keys alone', () => {
    const result = setFrontMatter(guide, 'commit', 'abc123')

    assert.match(result, /^commit: "abc123"$/m)
    assert.match(result, /^title: "LG-01: Foundations"$/m)
    assert.match(result, /^date: "2026-10-11"$/m)
  })

  it('adds a key that is missing', () => {
    const result = setFrontMatter('---\ntitle: "x"\n---\n\n# x', 'commit', 'abc123')

    assert.match(result, /^commit: "abc123"$/m)
  })

  it('does not touch a look-alike line in the body', () => {
    const text = '---\ntitle: "x"\n---\n\ncommit: "keep me"'

    const result = setFrontMatter(text, 'commit', 'abc123')

    assert.match(result, /\ncommit: "keep me"$/)
    assert.match(result, /^commit: "abc123"$/m)
  })

  it('refuses a document with no front matter', () => {
    assert.throws(() => setFrontMatter('# No front matter', 'commit', 'abc'), /front matter/)
  })
})

describe('stripForPdf', () => {
  it('removes the first H1 (the PDF has a title block) and keeps later headings', () => {
    const text = '---\ntitle: "T"\n---\n\n# T\n\nIntro\n\n## 1. First'

    const result = stripForPdf(text)

    assert.ok(!/^# T$/m.test(result))
    assert.ok(result.includes('## 1. First'))
    assert.ok(result.includes('Intro'))
  })

  it('removes the author note from the template, however many lines it spans', () => {
    const text = [
      '---', 'title: "T"', '---', '', '# T', '',
      '> How to use this template: copy it.',
      '> Second line of the note.',
      '> Delete these notes.',
      '',
      '## 1. First',
    ].join('\n')

    const result = stripForPdf(text)

    assert.ok(!result.includes('How to use this template'))
    assert.ok(!result.includes('Delete these notes'))
    assert.ok(result.includes('## 1. First'))
  })

  it('leaves other blockquotes alone', () => {
    const text = '---\ntitle: "T"\n---\n\n# T\n\n> A real quote worth keeping.\n\n## 1. First'

    assert.ok(stripForPdf(text).includes('> A real quote worth keeping.'))
  })
})

describe('prepareGuide', () => {
  it('replaces the code map between the markers and pins the commit and release', () => {
    const result = prepareGuide(guide, { table: '| new | table |', sha: 'f'.repeat(40), tag: 'v0.1.0' })

    assert.ok(!result.includes('| old | table |'))
    assert.ok(result.includes(`${CODE_MAP_START}\n\n| new | table |\n\n${CODE_MAP_END}`))
    assert.match(result, new RegExp(`^commit: "${'f'.repeat(40)}"$`, 'm'))
    assert.match(result, /^release: "v0\.1\.0"$/m)
    assert.ok(result.includes('## 4. Walkthrough'), 'text after the code map is kept')
  })

  it('keeps the release placeholder when no tag is given', () => {
    const result = prepareGuide(guide, { table: '| t |', sha: 'abc' })

    assert.match(result, /^release: "<git tag, e\.g\. v0\.1\.0>"$/m)
  })

  it('fails with a clear message when the markers are missing', () => {
    const withoutMarkers = guide.replace(CODE_MAP_START, '').replace(CODE_MAP_END, '')

    assert.throws(() => prepareGuide(withoutMarkers, { table: '| t |', sha: 'abc' }), /code-map:start/)
  })
})
