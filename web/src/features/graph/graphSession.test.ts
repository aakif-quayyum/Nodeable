import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearGraphSession, readGraphSession, saveGraphSession } from './graphSession.ts'

describe('graph session', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('FR_GRAPH_01 remembers the graph id and token across reads', () => {
    saveGraphSession({ id: 'g1', token: 't1' })

    expect(readGraphSession()).toEqual({ id: 'g1', token: 't1' })
    expect(readGraphSession()).toBe(readGraphSession())
  })

  it('FR_GRAPH_01 forgets the graph when it is cleared', () => {
    saveGraphSession({ id: 'g1', token: 't1' })
    clearGraphSession()

    expect(readGraphSession()).toBeNull()
  })

  it.each([
    ['not JSON', 'oops'],
    ['a number', '42'],
    ['an object without a token', '{"id":"g1"}'],
    ['a token that is not text', '{"id":"g1","token":5}'],
    ['an empty id', '{"id":"","token":"t"}'],
  ])('FR_GRAPH_01 treats %s in storage as no graph', (_, stored) => {
    localStorage.setItem('nodeable.graph', stored)

    expect(readGraphSession()).toBeNull()
  })

  it('FR_GRAPH_01 treats storage that throws as no graph, and does not throw when saving', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    expect(readGraphSession()).toBeNull()
    expect(() => saveGraphSession({ id: 'g1', token: 't1' })).not.toThrow()
  })
})
