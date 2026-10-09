// Adds DOM matchers such as toBeInTheDocument() to Vitest's expect.
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './server.ts'

// jsdom has no matchMedia, which MUI's colour-scheme support calls to follow the operating system setting.
window.matchMedia = (query: string): MediaQueryList => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  addListener: () => undefined,
  removeListener: () => undefined,
  dispatchEvent: () => false,
})

// "error" makes a request with no matching handler fail the test, so no test can silently reach a real server.
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
})

// Vitest does not clean up between tests on its own (unlike Jest with globals), and MUI remembers the chosen mode in localStorage.
afterEach(() => {
  cleanup()
  localStorage.clear()
  server.resetHandlers()
})

afterAll(() => {
  server.close()
})
