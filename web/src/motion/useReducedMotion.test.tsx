import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useReducedMotion } from './useReducedMotion.ts'

function Probe() {
  return <p>{useReducedMotion() ? 'still' : 'moving'}</p>
}

/** A media query list the test can flip, which notifies the page the way the browser does. */
function controllableQuery(initial: boolean) {
  let matches = initial
  const listeners = new Set<() => void>()
  window.matchMedia = ((query: string) => ({
    get matches() {
      return matches
    },
    media: query,
    onchange: null,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia

  return {
    set(next: boolean) {
      matches = next
      listeners.forEach((listener) => listener())
    },
  }
}

describe('useReducedMotion', () => {
  it('NFR_MOTION_01 reports the setting when the page starts', () => {
    controllableQuery(true)
    render(<Probe />)

    expect(screen.getByText('still')).toBeInTheDocument()
  })

  it('NFR_MOTION_01 follows the setting while the page is open', () => {
    const query = controllableQuery(false)
    render(<Probe />)
    expect(screen.getByText('moving')).toBeInTheDocument()

    act(() => query.set(true))
    expect(screen.getByText('still')).toBeInTheDocument()

    act(() => query.set(false))
    expect(screen.getByText('moving')).toBeInTheDocument()
  })
})
