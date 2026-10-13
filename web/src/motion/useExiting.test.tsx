import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setReducedMotion } from '../test/viewport.ts'
import { useExiting } from './useExiting.ts'

const keyOf = (item: string) => item

describe('useExiting', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('FR_GRAPH_06 keeps a removed item in its place, marked as leaving, until its exit has played', () => {
    setReducedMotion(false)

    const { result, rerender } = renderHook(({ items }) => useExiting(items, keyOf, 260), { initialProps: { items: ['a', 'b', 'c'] } })
    rerender({ items: ['a', 'c'] })

    expect(result.current.map((entry) => [entry.item, entry.leaving])).toEqual([
      ['a', false],
      ['b', true],
      ['c', false],
    ])

    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current.map((entry) => entry.item)).toEqual(['a', 'c'])
  })

  it('NFR_MOTION_01 removes an item at once when the person asked for reduced motion, which is the still version of its exit', () => {
    setReducedMotion(true)

    const { result, rerender } = renderHook(({ items }) => useExiting(items, keyOf, 260), { initialProps: { items: ['a', 'b', 'c'] } })
    rerender({ items: ['a', 'c'] })

    expect(result.current.map((entry) => [entry.item, entry.leaving])).toEqual([
      ['a', false],
      ['c', false],
    ])
  })
})
