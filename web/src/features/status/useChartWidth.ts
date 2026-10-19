import { useEffect, useRef, useState } from 'react'

/** About three pixels a point is plenty for a line; the Api cuts the window into at most this many steps (10 to 600). */
export function widthFor(containerPixels: number): number {
  const wanted = Math.round(containerPixels / 3 / 20) * 20
  return Math.min(600, Math.max(20, wanted))
}

/**
 * Follows the width of an element, so the number of points asked of the Api matches what the charts in it can draw.
 * Where there is no ResizeObserver (jsdom) it keeps its first guess, as the orbit does.
 */
export function useContainerWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [pixels, setPixels] = useState(960)
  useEffect(() => {
    const element = ref.current
    if (element === null || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => {
      if (element.clientWidth > 0) setPixels(element.clientWidth)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return { ref, pixels }
}
