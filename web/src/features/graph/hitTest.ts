import { quadtree } from 'd3-quadtree'
import type { GraphNode } from './graphModel.ts'

/** How far outside a node's edge still counts as pointing at it, in screen pixels: a small target is easier to hit. */
const SLOP_PX = 4

export interface HitTester {
  /** The node at a point in graph coordinates, or null. `k` is the current zoom, so the slop stays the same size on screen. */
  find(x: number, y: number, k: number): GraphNode | null
}

/**
 * Hit testing with a quadtree: instead of measuring the distance to every node on each mouse move (500 nodes, sixty
 * times a second), the plane is divided into nested squares and whole squares that cannot contain the point are
 * skipped.
 */
export function createHitTester(nodes: readonly GraphNode[]): HitTester {
  // LEARN: LG-03 quadtree-hit-test | A quadtree splits the plane into nested squares, so "which node is under the pointer" visits a handful of squares instead of every node; d3-quadtree is the same structure a game engine or map library uses, and the search prunes any square farther away than the best hit so far
  const tree = quadtree<GraphNode>()
    .x((node) => node.x ?? 0)
    .y((node) => node.y ?? 0)
    .addAll([...nodes])

  const largest = nodes.reduce((max, node) => Math.max(max, node.r), 0)

  return {
    find(x, y, k) {
      const slop = SLOP_PX / k
      let best: GraphNode | null = null
      let bestGap = Infinity

      tree.visit((quad, x0, y0, x1, y1) => {
        // Skip a square that is entirely too far from the point to hold a node that reaches it.
        const reach = largest + slop
        if (x < x0 - reach || x > x1 + reach || y < y0 - reach || y > y1 + reach) {
          return true
        }

        if (!quad.length) {
          let leaf: typeof quad | undefined = quad
          while (leaf) {
            const node = (leaf as { data: GraphNode }).data
            const gap = Math.hypot((node.x ?? 0) - x, (node.y ?? 0) - y) - node.r
            if (gap <= slop && gap < bestGap) {
              best = node
              bestGap = gap
            }
            leaf = (leaf as { next?: typeof quad }).next
          }
        }
        return false
      })

      return best
    },
  }
}
