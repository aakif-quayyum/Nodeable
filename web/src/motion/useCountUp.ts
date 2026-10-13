import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from './useReducedMotion.ts'

/**
 * A number that counts to its target instead of jumping (NFR-MOTION-01). It starts from what is shown now, so a target
 * that changes mid-count carries on from where the count had got to. With reduced motion it is the target itself.
 */
export function useCountUp(target: number, durationMs = 650): number {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(0)
  const latest = useRef(0)

  useEffect(() => {
    if (reduced) return
    const origin = latest.current
    const start = performance.now()
    let frame = 0

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      latest.current = Math.round(origin + (target - origin) * eased)
      setShown(latest.current)
      if (t < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [target, reduced, durationMs])

  return reduced ? target : shown
}
