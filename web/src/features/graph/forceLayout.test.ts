import { describe, expect, it } from 'vitest'
import { GraphLayout, REHEAT_ALPHA, type LayoutInput } from './forceLayout.ts'

type Positions = Map<string, { x: number; y: number }>

function run(input: LayoutInput, steps = 200) {
  const positions: Positions = new Map()
  const layout = new GraphLayout(
    (nodes) => nodes.forEach((node) => positions.set(node.id, { x: node.x, y: node.y })),
    () => undefined,
    { autoStart: false },
  )
  layout.update(input)
  layout.step(steps)
  return { layout, positions }
}

const song = (id: string) => ({ id, r: 10 })
const person = (id: string, r = 6) => ({ id, r })

describe('GraphLayout', () => {
  it('NFR_PERF_03 gives every node a finite position', () => {
    const { positions } = run({
      nodes: [song('s1'), person('p1'), person('p2')],
      links: [
        { source: 's1', target: 'p1' },
        { source: 's1', target: 'p2' },
      ],
    })

    for (const { x, y } of positions.values()) {
      expect(Number.isFinite(x)).toBe(true)
      expect(Number.isFinite(y)).toBe(true)
    }
    expect(positions.size).toBe(3)
  })

  it('NFR_PERF_03 places the same graph in the same positions every time', () => {
    const input: LayoutInput = { nodes: [song('s1'), person('p1')], links: [{ source: 's1', target: 'p1' }] }

    expect(run(input).positions).toEqual(run(input).positions)
  })

  it('FR_GRAPH_02 keeps the nodes it already has where they are when a node is added, and starts the new one beside its song', () => {
    const { layout, positions } = run({
      nodes: [song('s1'), person('p1')],
      links: [{ source: 's1', target: 'p1' }],
    })
    const before = new Map(positions)

    layout.update({
      nodes: [song('s1'), person('p1'), person('p2')],
      links: [
        { source: 's1', target: 'p1' },
        { source: 's1', target: 'p2' },
      ],
    })
    // No steps: only the seeding has happened.
    layout.step(0)

    const songAt = before.get('s1')!
    const newcomer = positions.get('p2')!
    expect(positions.get('s1')).toEqual(songAt)
    expect(Math.hypot(newcomer.x - songAt.x, newcomer.y - songAt.y)).toBeLessThan(60)
  })

  it('NFR_PERF_03 reheats gently when nodes are added and not when nothing changed', () => {
    const { layout } = run({ nodes: [song('s1'), person('p1')], links: [{ source: 's1', target: 'p1' }] }, 400)
    expect(layout.alpha).toBeLessThan(0.05)

    const unchanged = layout.update({ nodes: [song('s1'), person('p1')], links: [{ source: 's1', target: 'p1' }] })
    expect(unchanged).toBe(false)
    expect(layout.alpha).toBeLessThan(0.05)

    const changed = layout.update({
      nodes: [song('s1'), person('p1'), person('p2')],
      links: [{ source: 's1', target: 'p1' }],
    })
    expect(changed).toBe(true)
    expect(layout.alpha).toBeGreaterThanOrEqual(REHEAT_ALPHA)
  })

  it('NFR_PERF_03 settles: alpha falls below the stopping value after enough steps', () => {
    const { layout } = run({ nodes: [song('s1'), person('p1'), person('p2')], links: [{ source: 's1', target: 'p1' }] }, 500)

    expect(layout.alpha).toBeLessThan(0.001)
  })

  it('NFR_PERF_03 keeps a position that came with a node', () => {
    const positions: Positions = new Map()
    const layout = new GraphLayout(
      (nodes) => nodes.forEach((node) => positions.set(node.id, { x: node.x, y: node.y })),
      () => undefined,
      { autoStart: false },
    )

    layout.update({ nodes: [{ id: 's1', r: 10, x: 123, y: -45 }], links: [] })
    layout.step(0)

    expect(positions.get('s1')).toEqual({ x: 123, y: -45 })
  })

  it('NFR_PERF_03 lays out 600 nodes (the size where the worker takes over) in a few seconds', () => {
    const nodes = Array.from({ length: 50 }, (_, index) => song(`s${index}`))
    const links: LayoutInput['links'] = []
    for (let index = 0; index < 550; index++) {
      nodes.push(person(`p${index}`, 6))
      // Each person is credited on one song, and every tenth on three, as in real graphs.
      links.push({ source: `s${index % 50}`, target: `p${index}` })
      if (index % 10 === 0) {
        links.push({ source: `s${(index + 7) % 50}`, target: `p${index}` })
        links.push({ source: `s${(index + 19) % 50}`, target: `p${index}` })
      }
    }

    const started = performance.now()
    const { layout, positions } = run({ nodes, links }, 300)
    const elapsed = performance.now() - started

    // The figure is recorded in the pull request and the spec; the bound is generous so a slow CI machine passes.
    console.info(`600 nodes: 300 steps in ${elapsed.toFixed(0)} ms (${(elapsed / 300).toFixed(2)} ms per step)`)
    expect(positions.size).toBe(600)
    expect(layout.nodeCount).toBe(600)
    expect(elapsed).toBeLessThan(15_000)
  })
})
