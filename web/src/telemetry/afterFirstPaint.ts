/**
 * Runs the callback once the browser has painted the first frame.
 *
 * requestAnimationFrame fires just before the next paint; the setTimeout inside it fires after that paint has
 * happened. Work started here no longer competes with the first render (decision 0002).
 */
export function afterFirstPaint(callback: () => void): void {
  requestAnimationFrame(() => {
    setTimeout(callback, 0)
  })
}
