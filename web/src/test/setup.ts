// Adds DOM matchers such as toBeInTheDocument() to Vitest's expect.
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './server.ts'

// jsdom has no matchMedia, which MUI's colour-scheme support calls to follow the operating system setting.
const defaultMatchMedia = (query: string): MediaQueryList => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  addListener: () => undefined,
  removeListener: () => undefined,
  dispatchEvent: () => false,
})
window.matchMedia = defaultMatchMedia

// "error" makes a request with no matching handler fail the test, so no test can silently reach a real server.
beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' })
})

// Vitest does not clean up between tests on its own (unlike Jest with globals), and MUI remembers the chosen mode in localStorage.
afterEach(() => {
  cleanup()
  localStorage.clear()
  // A test that picked a window width (test/viewport.ts) does not leave it for the next one.
  window.matchMedia = defaultMatchMedia
  server.resetHandlers()
})

afterAll(() => {
  server.close()
})

// jsdom has no canvas: getContext reports "not implemented" and returns null. The graph component treats a missing 2D
// context as "nothing to draw" (the tables carry the data), and this keeps the test output free of that warning.
HTMLCanvasElement.prototype.getContext = () => null
