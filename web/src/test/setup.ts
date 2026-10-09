// Adds DOM matchers such as toBeInTheDocument() to Vitest's expect.
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

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

// Vitest does not clean up between tests on its own (unlike Jest with globals), and MUI remembers the chosen mode in localStorage.
afterEach(() => {
  cleanup()
  localStorage.clear()
})
