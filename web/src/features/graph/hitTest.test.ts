import { describe, expect, it } from 'vitest'
import type { GraphNode } from './graphModel.ts'
import { createHitTester } from './hitTest.ts'

const person = (id: string, x: number, y: number, r = 8): GraphNode => ({
  kind: 'person',
  id,
  mbid: id,
  name: id,
  songs: 1,
  roles: ['producer'],
  isHub: false,
  r,
  x,
  y,
})

describe('createHitTester', () => {
  const nodes = [person('a', 0, 0), person('b', 100, 0), person('c', 100, 20, 4)]
  const tester = createHitTester(nodes)

  it('FR_HUB_01 finds the node under a point', () => {
    expect(tester.find(2, 3, 1)?.id).toBe('a')
    expect(tester.find(100, 0, 1)?.id).toBe('b')
  })

  it('FR_HUB_01 finds nothing in empty space', () => {
    expect(tester.find(50, 50, 1)).toBeNull()
  })

  it('FR_HUB_01 allows a few pixels of slop around a node, the same size on screen at any zoom', () => {
    // 8 px radius + 4 px slop = 12 px at zoom 1; at zoom 4 the slop is 1 graph unit.
    expect(tester.find(11, 0, 1)?.id).toBe('a')
    expect(tester.find(13, 0, 1)).toBeNull()
    expect(tester.find(8.9, 0, 4)?.id).toBe('a')
    expect(tester.find(10, 0, 4)).toBeNull()
  })

  it('FR_HUB_01 prefers the node whose edge is nearest when two overlap the point', () => {
    // 9 from b's centre (1 from its edge) and 11 from c's centre (7 from its edge).
    expect(tester.find(100, 9, 1)?.id).toBe('b')
  })

  it('FR_HUB_01 returns null for an empty graph', () => {
    expect(createHitTester([]).find(0, 0, 1)).toBeNull()
  })
})
