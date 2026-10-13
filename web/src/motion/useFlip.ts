import { useLayoutEffect, useRef, type RefObject } from 'react'
import { useReducedMotion } from './useReducedMotion.ts'

const durationMs = 480
const easing = 'cubic-bezier(0.2, 0.8, 0.2, 1)'

/**
 * FLIP for a list that reorders (NFR-MOTION-01, FR-HUB-02): First, Last, Invert, Play. Before the browser paints the new
 * order, each item that has moved is put back where it was with a transform, and then released to slide to its new
 * place. Only `transform` is animated, so nothing is laid out again while it plays.
 *
 * Items are the container's children that carry `data-flip="<key>"`. `order` is anything that changes when the order or
 * the set of items changes (a joined list of keys is enough); an item that was not there before is not animated here
 * (it has its own entrance). Positions are measured against the container, so scrolling the container is not a move.
 */
// LEARN: LG-03R flip | FLIP measures where each element was and where it is now, applies the difference as a transform before the browser paints, and animates that transform back to nothing: the layout has already jumped, and the eye sees a slide, with no layout work during the animation because only transform changes
export function useFlip(container: RefObject<HTMLElement | null>, order: string): void {
  const reduced = useReducedMotion()
  const before = useRef(new Map<string, { x: number; y: number }>())

  useLayoutEffect(() => {
    const root = container.current
    if (root === null) return
    const origin = root.getBoundingClientRect()
    const after = new Map<string, { x: number; y: number }>()

    for (const element of root.querySelectorAll<HTMLElement>('[data-flip]')) {
      const key = element.dataset.flip
      if (key === undefined) continue
      const box = element.getBoundingClientRect()
      const at = { x: box.left - origin.left, y: box.top - origin.top }
      after.set(key, at)

      const was = before.current.get(key)
      if (was === undefined || reduced || typeof element.animate !== 'function') continue
      const dx = was.x - at.x
      const dy = was.y - at.y
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue
      element.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: durationMs, easing })
    }
    before.current = after
  }, [container, order, reduced])
}
