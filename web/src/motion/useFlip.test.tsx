import { render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setReducedMotion } from '../test/viewport.ts'
import { useFlip } from './useFlip.ts'

function List({ keys }: { keys: string[] }) {
  const ref = useRef<HTMLUListElement>(null)
  useFlip(ref, keys.join('|'))
  return (
    <ul ref={ref}>
      {keys.map((key) => (
        <li key={key} data-flip={key}>
          {key}
        </li>
      ))}
    </ul>
  )
}

describe('useFlip', () => {
  const animate = vi.fn()

  beforeEach(() => {
    animate.mockReset()
    Element.prototype.animate = animate
    // jsdom has no layout: an item's top is where it is in its list, 40 px for each place.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const place = this.dataset.flip === undefined ? 0 : Array.from(this.parentElement!.children).indexOf(this)
      return { top: place * 40, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: place * 40, toJSON: () => ({}) }
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('NFR_MOTION_01 slides an item that has moved from where it was to where it is, with a transform only', () => {
    setReducedMotion(false)
    const view = render(<List keys={['a', 'b', 'c']} />)
    expect(animate).not.toHaveBeenCalled()

    view.rerender(<List keys={['c', 'a', 'b']} />)

    // c went from place 2 to place 0: it starts 80 px below where it is and slides to none.
    const calls = animate.mock.calls as [Keyframe[], KeyframeAnimationOptions][]
    expect(calls).toHaveLength(3)
    const slides = calls.map(([frames]) => frames[0]!.transform)
    expect(slides).toContain('translate(0px, 80px)')
    expect(slides).toContain('translate(0px, -40px)')
    expect(calls[0]![0]).toHaveLength(2)
    expect(calls[0]![0]![1]!.transform).toBe('none')
  })

  it('NFR_MOTION_01 does not animate an item that is new, or one that did not move', () => {
    setReducedMotion(false)
    const view = render(<List keys={['a', 'b']} />)

    view.rerender(<List keys={['a', 'b', 'c']} />)

    expect(animate).not.toHaveBeenCalled()
  })

  it('NFR_MOTION_01 puts items in their new places at once when the person asked for reduced motion', () => {
    setReducedMotion(true)
    const view = render(<List keys={['a', 'b']} />)

    view.rerender(<List keys={['b', 'a']} />)

    expect(animate).not.toHaveBeenCalled()
  })
})
