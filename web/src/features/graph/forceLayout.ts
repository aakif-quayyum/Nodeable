import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force'

/** What the layout needs to know about a node: who it is and how big. `x` and `y` carry a position it already has. */
export interface LayoutNodeInput {
  id: string
  r: number
  x?: number | undefined
  y?: number | undefined
}

export interface LayoutLinkInput {
  source: string
  target: string
}

export interface LayoutInput {
  nodes: LayoutNodeInput[]
  links: LayoutLinkInput[]
}

interface SimNode extends SimulationNodeDatum {
  id: string
  r: number
}

type SimLink = SimulationLinkDatum<SimNode>

/** A new node is placed at least this close to the nodes it is connected to. */
const seedSpread = 24

/** Reheat strength after nodes were added: gentle, so what is already placed does not jump (spec section 12). */
export const REHEAT_ALPHA = 0.3

// A small deterministic generator (mulberry32), so the same graph gets the same layout in tests and in the browser.
function randomFrom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash(text: string): number {
  let value = 2166136261
  for (let index = 0; index < text.length; index++) {
    value = Math.imul(value ^ text.charCodeAt(index), 16777619)
  }
  return value >>> 0
}

/**
 * The force simulation behind the graph. It knows nothing about React, the canvas or threads: it is given nodes and
 * links, moves the nodes, and reports their positions. That is what lets the same code run in the page for small
 * graphs and in a Web Worker for large ones (NFR-PERF-03).
 */
export class GraphLayout {
  private readonly simulation: Simulation<SimNode, SimLink>
  private readonly linkForce = forceLink<SimNode, SimLink>().id((node) => node.id).distance(70).strength(0.4)
  private readonly autoStart: boolean
  private nodes: SimNode[] = []
  private ids = new Set<string>()

  private readonly onTick: (nodes: readonly { id: string; x: number; y: number }[]) => void
  private readonly onSettled: () => void

  // TypeScript can declare a field from a constructor parameter (`private readonly x`), but this project turns on
  // erasableSyntaxOnly, so the fields are written out: only syntax that is just types, which Node can also run.
  constructor(
    onTick: (nodes: readonly { id: string; x: number; y: number }[]) => void,
    onSettled: () => void = () => undefined,
    options: { autoStart?: boolean } = {},
  ) {
    this.onTick = onTick
    this.onSettled = onSettled
    this.autoStart = options.autoStart !== false
    this.simulation = forceSimulation<SimNode, SimLink>()
      .force('link', this.linkForce)
      // A bigger node pushes harder, so hubs get room around them.
      .force('charge', forceManyBody<SimNode>().strength((node) => -40 - node.r * 6))
      .force('collide', forceCollide<SimNode>().radius((node) => node.r + 4))
      // Weak pulls toward the middle keep separate clusters from drifting apart without a centre force's jitter.
      .force('x', forceX<SimNode>(0).strength(0.04))
      .force('y', forceY<SimNode>(0).strength(0.04))
      .on('tick', () => this.onTick(this.nodes as { id: string; x: number; y: number }[]))
      // The simulation stops itself when alpha falls below alphaMin: nothing runs while the graph is at rest.
      .on('end', () => this.onSettled())

    if (!this.autoStart) {
      this.simulation.stop()
    }
  }

  /**
   * Makes the layout match `input`. Nodes it already has keep their place; new nodes are placed next to the nodes they
   * are linked to; and the simulation is reheated gently if the set of nodes changed. Returns whether it changed.
   */
  update(input: LayoutInput): boolean {
    const existing = new Map(this.nodes.map((node) => [node.id, node]))
    const neighbours = new Map<string, string[]>()
    const connect = (from: string, to: string) => {
      const list = neighbours.get(from)
      if (list === undefined) neighbours.set(from, [to])
      else list.push(to)
    }
    for (const link of input.links) {
      connect(link.source, link.target)
      connect(link.target, link.source)
    }

    const next: SimNode[] = []
    let changed = input.nodes.length !== this.nodes.length

    for (const node of input.nodes) {
      const kept = existing.get(node.id)
      if (kept !== undefined) {
        kept.r = node.r
        next.push(kept)
        continue
      }

      changed = true
      const created: SimNode = { id: node.id, r: node.r }
      if (node.x !== undefined && node.y !== undefined) {
        // A position that came with the node (for example from the other layout engine) is kept as it is.
        created.x = node.x
        created.y = node.y
      }
      next.push(created)
    }

    // Songs come first in the input, so by the time a person is placed the songs it is credited on have a position
    // and the person starts beside them: new credits appear next to their song instead of flying in from the middle.
    const byId = new Map(next.map((node) => [node.id, node]))
    for (const node of next) {
      if (node.x !== undefined && node.y !== undefined) continue

      const random = randomFrom(hash(node.id))
      const angle = random() * Math.PI * 2
      const distance = seedSpread * (0.5 + random())
      const placed = (neighbours.get(node.id) ?? [])
        .map((id) => byId.get(id))
        .filter((other): other is SimNode => other?.x !== undefined && other.y !== undefined)

      if (placed.length > 0) {
        const cx = placed.reduce((sum, other) => sum + other.x!, 0) / placed.length
        const cy = placed.reduce((sum, other) => sum + other.y!, 0) / placed.length
        node.x = cx + Math.cos(angle) * distance
        node.y = cy + Math.sin(angle) * distance
      } else {
        node.x = Math.cos(angle) * distance * 4
        node.y = Math.sin(angle) * distance * 4
      }
    }

    this.nodes = next
    this.ids = new Set(next.map((node) => node.id))

    // The simulation rewrites each link's ends from ids to node objects; give it fresh link objects each time.
    const links: SimLink[] = input.links
      .filter((link) => this.ids.has(link.source) && this.ids.has(link.target))
      .map((link) => ({ source: link.source, target: link.target }))

    this.simulation.nodes(this.nodes)
    this.linkForce.links(links)

    if (changed) {
      this.simulation.alpha(Math.max(this.simulation.alpha(), REHEAT_ALPHA))
      if (this.autoStart) this.simulation.restart()
    }
    return changed
  }

  /** Runs `count` steps now and reports the result once. For tests and for measuring; the timer is not involved. */
  step(count: number): void {
    this.simulation.stop()
    for (let index = 0; index < count; index++) {
      this.simulation.tick()
    }
    this.onTick(this.nodes as { id: string; x: number; y: number }[])
  }

  get alpha(): number {
    return this.simulation.alpha()
  }

  get nodeCount(): number {
    return this.nodes.length
  }

  stop(): void {
    this.simulation.stop()
  }
}
