import assert from 'node:assert/strict'
import { test } from 'node:test'
import { versionChange } from './check-openapi-breaking.mjs'
import { normalise } from './write-openapi.mjs'

const doc = (version) => JSON.stringify({ openapi: '3.1.1', info: { title: 'Nodeable.Api', version }, paths: {} })

test('NFR_SEC_04 a breaking change is allowed only when info.version changed', () => {
  assert.equal(versionChange(doc('1.0.0'), doc('1.0.0')).allowed, false)
  assert.equal(versionChange(doc('1.0.0'), doc('2.0.0')).allowed, true)
  assert.deepEqual(versionChange(doc('1.0.0'), doc('2.0.0')), { allowed: true, base: '1.0.0', head: '2.0.0' })
})

test('NFR_SEC_04 a document with no version never allows a breaking change', () => {
  assert.equal(versionChange(doc('1.0.0'), JSON.stringify({ openapi: '3.1.1', paths: {} })).allowed, false)
})

test('NFR_SEC_04 the committed document is the same bytes whatever line endings the build wrote', () => {
  const unix = '{"openapi":"3.1.1","info":{"version":"1.0.0"},\n"paths":{}}'
  const windows = unix.replaceAll('\n', '\r\n')

  assert.equal(normalise(unix), normalise(windows))
  assert.ok(normalise(unix).endsWith('}\n'))
  assert.ok(!normalise(windows).includes('\r'))
})
