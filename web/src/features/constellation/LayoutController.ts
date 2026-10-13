import type { DerivedGraph } from '../graph/graphModel.ts'
import { createLayoutEngine, WORKER_NODE_THRESHOLD, type LayoutEngine } from '../graph/layoutEngine.ts'

export interface Position {
  x: number
  y: number
}

/**
 * Where the nodes are, kept outside React. The force simulation (on this thread, or in a Web Worker above 500 nodes)
 * reports positions many times a second; they land here, and a renderer that has subscribed paints them straight
 * onto its elements or canvas. Nothing in React re-renders while the graph moves (NFR-PERF-03).
 */
// LEARN: LG-03R layout-controller | The simulation's output goes into a plain object that renderers subscribe to, not into React state: a tick is a write to a Map and a call to a paint function, so sixty updates a second cost no renders, and the same positions can drive SVG elements below the threshold and a canvas above it
export class LayoutController {
  readonly positions = new Map<string, Position>()
  private readonly listeners = new Set<() => void>()
  private readonly settledListeners = new Set<() => void>()
  private engine: LayoutEngine | null = null
  private graph: DerivedGraph | null = null
  private worker = false
  private still = false

  /** The simulation is not run at all when the person asked for reduced motion: the layout is worked out to rest first. */
  setReducedMotion(reduced: boolean): void {
    this.still = reduced
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  onSettled(listener: () => void): () => void {
    this.settledListeners.add(listener)
    return () => this.settledListeners.delete(listener)
  }

  /** Gives the layout this graph, on the page's thread or in the worker according to its size. */
  update(graph: DerivedGraph): void {
    const worker = graph.nodes.length > WORKER_NODE_THRESHOLD
    this.graph = graph

    if (this.engine === null || worker !== this.worker) {
      this.engine?.dispose()
      this.worker = worker
      this.engine = createLayoutEngine(worker, {
        onPositions: (ids, xy) => {
          ids.forEach((id, index) => {
            const known = this.positions.get(id)
            if (known === undefined) this.positions.set(id, { x: xy[index * 2]!, y: xy[index * 2 + 1]! })
            else {
              known.x = xy[index * 2]!
              known.y = xy[index * 2 + 1]!
            }
          })
          for (const listener of this.listeners) listener()
        },
        onSettled: () => {
          for (const listener of this.settledListeners) listener()
        },
      })
    }

    this.engine.update(
      {
        nodes: graph.nodes.map((node) => ({
          id: node.id,
          r: node.r,
          heavy: node.kind === 'song',
          x: this.positions.get(node.id)?.x,
          y: this.positions.get(node.id)?.y,
        })),
        links: graph.links,
      },
      { rest: this.still },
    )

    // A node that left the graph has no position any more.
    const ids = new Set(graph.nodes.map((node) => node.id))
    for (const id of this.positions.keys()) if (!ids.has(id)) this.positions.delete(id)
  }

  pin(id: string, x: number, y: number): void {
    const position = this.positions.get(id)
    if (position !== undefined) {
      position.x = x
      position.y = y
    }
    this.engine?.pin(id, x, y)
    for (const listener of this.listeners) listener()
  }

  release(id: string): void {
    this.engine?.release(id)
  }

  /** The nodes the layout has been given, for a renderer's first paint. */
  get current(): DerivedGraph | null {
    return this.graph
  }

  dispose(): void {
    this.engine?.dispose()
    this.engine = null
    this.listeners.clear()
    this.settledListeners.clear()
  }
}
