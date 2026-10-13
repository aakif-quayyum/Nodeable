import { describe, expect, it, vi } from 'vitest'
import { OrbitMotion, transitionMs } from './orbitMotion.ts'
import type { OrbitLayout, OrbitNode } from './orbitLayout.ts'

function node(id: string, depth: 0 | 1 | 2, parent: string | null, angle: number, radius: number, size = 20): OrbitNode {
  return { id, kind: id.startsWith('s') ? 'song' : 'person', ref: id, depth, parent, angle, radius, size, hit: size, label: id, lines: [id], place: depth === 2 ? 'radial' : 'below', moreCount: 0 }
}

function layoutOf(nodes: OrbitNode[]): OrbitLayout {
  return {
    centre: { type: 'song', id: 'x' },
    nodes,
    links: [],
    crossLinks: [],
    guides: [],
    arcs: [],
    radius: 200,
    origin: { x: 0, y: 0 },
    scale: 1,
    fontScale: 1,
    key: nodes.map((n) => n.id).join(','),
    empty: null,
  }
}

function motion() {
  const painted = vi.fn()
  const gone = vi.fn()
  const settled = vi.fn()
  return { engine: new OrbitMotion(painted, gone, settled), painted, gone, settled }
}

describe('orbit motion', () => {
  it('NFR_MOTION_01 puts every node in its place at once when it is not animating', () => {
    const { engine, painted, settled } = motion()
    const layout = layoutOf([node('s:a', 0, null, 0, 0, 52), node('p:x', 1, 's:a', 1, 100), node('p:y', 1, 's:a', 3, 100)])

    engine.retarget(layout, false)

    expect(engine.current.get('p:x')!.cur).toEqual({ a: 1, r: 100 })
    expect(engine.current.get('p:y')!.opacity).toBe(1)
    expect(engine.current.get('s:a')!.size).toBe(52)
    expect(painted).toHaveBeenCalled()
    expect(settled).toHaveBeenCalledTimes(1)
  })

  it('FR_GRAPH_02 brings a new node in from its parent, one after another, then settles on its place', () => {
    const { engine, settled } = motion()
    engine.retarget(layoutOf([node('s:a', 0, null, 0, 0), node('p:x', 1, 's:a', 1, 100)]), false)

    engine.retarget(layoutOf([node('s:a', 0, null, 0, 0), node('p:x', 1, 's:a', 1, 100), node('p:y', 1, 's:a', 3, 100), node('p:z', 1, 's:a', 5, 100)]), true)
    const y = engine.current.get('p:y')!
    const z = engine.current.get('p:z')!

    expect(y.entering).toBe(true)
    expect(y.cur.r).toBe(0)
    expect(z.delay).toBeGreaterThan(y.delay)

    engine.advance(10)
    expect(y.opacity).toBe(0)

    engine.advance(transitionMs + 1000)
    expect(y.cur.r).toBeCloseTo(100)
    expect(z.opacity).toBe(1)
    expect(settled).toHaveBeenCalledTimes(2)
  })

  it('FR_VIEW_01 folds a node that is gone inward as it fades, and tells the view when it has left', () => {
    const { engine, gone } = motion()
    engine.retarget(layoutOf([node('s:a', 0, null, 0, 0), node('p:x', 1, 's:a', 1, 100), node('p:y', 1, 's:a', 3, 100)]), false)

    engine.retarget(layoutOf([node('s:a', 0, null, 0, 0), node('p:x', 1, 's:a', 1, 100)]), true)
    const leaving = engine.current.get('p:y')!
    expect(leaving.exiting).toBe(true)

    engine.advance(transitionMs / 2)
    expect(leaving.opacity).toBeLessThan(1)
    expect(leaving.cur.r).toBeLessThan(100)

    engine.advance(transitionMs + 10)
    expect(gone).toHaveBeenCalledWith(['p:y'])
    expect(engine.current.has('p:y')).toBe(false)
  })

  it('FR_VIEW_01 moves a node that stays by the short way round the circle', () => {
    const { engine } = motion()
    const turn = Math.PI * 2
    engine.retarget(layoutOf([node('s:a', 0, null, 0, 0), node('p:x', 1, 's:a', turn - 0.2, 100)]), false)

    engine.retarget(layoutOf([node('s:a', 0, null, 0, 0), node('p:x', 1, 's:a', 0.2, 100)]), true)
    engine.advance(transitionMs / 2 + 80)

    // Half way is at the top (0 or a whole turn), not at the bottom (pi) where the long way round would be.
    const angle = engine.current.get('p:x')!.cur.a
    expect(Math.cos(angle)).toBeGreaterThan(0.99)
  })

  it('NFR_MOTION_01 does not delay new nodes when it was told not to stagger', () => {
    const { engine } = motion()
    engine.retarget(layoutOf([node('s:a', 0, null, 0, 0)]), false)

    engine.retarget(layoutOf([node('s:a', 0, null, 0, 0), node('p:x', 1, 's:a', 1, 100), node('p:y', 1, 's:a', 2, 100)]), true, false)

    expect(engine.current.get('p:x')!.delay).toBe(0)
    expect(engine.current.get('p:y')!.delay).toBe(0)
    engine.dispose()
  })
})
