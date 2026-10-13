/**
 * Makes `window.matchMedia` answer as a window of the given width would, for the width queries MUI's useMediaQuery
 * sends (`min-width` and `max-width`). jsdom has no layout, so a test that cares which layout is shown picks a width.
 */
export function setViewportWidth(width: number): void {
  window.matchMedia = (query: string): MediaQueryList => {
    const min = /min-width:\s*([\d.]+)px/.exec(query)
    const max = /max-width:\s*([\d.]+)px/.exec(query)
    const matches = (min === null || width >= Number(min[1])) && (max === null || width <= Number(max[1]))

    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }
  }
}

/** Makes `prefers-reduced-motion: reduce` match (or not), for a test of NFR-MOTION-01. Reset after each test by setup.ts. */
export function setReducedMotion(reduce: boolean): void {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })
}
