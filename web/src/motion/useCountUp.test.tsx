import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setReducedMotion } from '../test/viewport.ts'
import { useCountUp } from './useCountUp.ts'

describe('useCountUp', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('NFR_MOTION_01 shows the real number at once when the person asked for reduced motion', () => {
    setReducedMotion(true)

    const { result } = renderHook(() => useCountUp(42))

    expect(result.current).toBe(42)
  })

  it('NFR_MOTION_01 counts up to the number over the duration when motion is allowed, and lands exactly on it', () => {
    setReducedMotion(false)

    const { result } = renderHook(() => useCountUp(42, 650))
    expect(result.current).toBe(0)

    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current).toBeGreaterThan(0)
    expect(result.current).toBeLessThan(42)

    act(() => {
      vi.advanceTimersByTime(600)
    })
    expect(result.current).toBe(42)
  })

  it('NFR_MOTION_01 carries on from where the count had got to when the target changes', () => {
    setReducedMotion(false)

    const { result, rerender } = renderHook(({ target }) => useCountUp(target, 650), { initialProps: { target: 10 } })
    act(() => {
      vi.advanceTimersByTime(700)
    })
    expect(result.current).toBe(10)

    rerender({ target: 20 })
    act(() => {
      vi.advanceTimersByTime(700)
    })

    expect(result.current).toBe(20)
  })
})
