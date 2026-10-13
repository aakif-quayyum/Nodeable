import { easeBackOut, easeCubicInOut } from 'd3-ease'
import { timer, type Timer } from 'd3-timer'
import { lerpAngle, type OrbitLayout, type OrbitNode } from './orbitLayout.ts'

/** How long a re-rooting takes (spec section 12): about a second, with a cubic ease. */
export const transitionMs = 950
/** The streaming bloom: new nodes start one after another, this far apart, over at most `maxStaggerMs` in all. */
const staggerStepMs = 32
const maxStaggerMs = 900
const firstDelayMs = 80

export interface MotionNode {
  id: string
  kind: OrbitNode['kind']
  depth: number
  parent: string | null
  /** Where the node is drawn right now. */
  cur: { a: number; r: number }
  from: { a: number; r: number }
  tgt: { a: number; r: number }
  size: number
  sizeFrom: number
  sizeTo: number
  opacity: number
  delay: number
  entering: boolean
  exiting: boolean
}

const pop = easeBackOut.overshoot(1.8)

/**
 * The orbit's animation as plain data and a clock: where each node is, where it is going and how far along. It knows
 * nothing about the DOM. The view tells it a new layout (`retarget`) and gives it a function that draws a frame
 * (`paint`); a `d3-timer` calls `advance` once per frame until every node has arrived, and then stops, so a graph at
 * rest costs no frames (NFR-MOTION-01, NFR-PERF-03).
 *
 * A node that is in the new layout but was not in the old one *enters* from its parent; a node that was in the old one
 * and is not in the new one *exits*, folding inward as it fades. A node that is in both moves from wherever it is
 * now, so a transition that is interrupted by another carries on smoothly from the middle.
 */
export class OrbitMotion {
  private readonly nodes = new Map<string, MotionNode>()
  private clock: Timer | null = null
  private duration = transitionMs

  /** The layout key this motion was last pointed at: the view uses it to tell a resize (snap) from a change (animate). */
  key: string | null = null

  // LEARN: LG-03R erasable-syntax | The project compiles with erasableSyntaxOnly, which forbids constructor parameter properties (`private readonly paint` written in the parameter list) because they make TypeScript generate code that JavaScript's own class syntax does not have; the field is declared in the body and assigned in the constructor, as plain JavaScript would
  private readonly paint: (nodes: ReadonlyMap<string, MotionNode>) => void
  /** Called when the nodes that were leaving have gone, with their ids: the view stops rendering them. */
  private readonly gone: (ids: string[]) => void
  /** Called when every node has reached its place. */
  private readonly settled: () => void

  constructor(paint: (nodes: ReadonlyMap<string, MotionNode>) => void, gone: (ids: string[]) => void, settled: () => void) {
    this.paint = paint
    this.gone = gone
    this.settled = settled
  }

  get current(): ReadonlyMap<string, MotionNode> {
    return this.nodes
  }

  /**
   * Starts moving toward `layout`. Without `animate` every node is put in its place at once (a resize, or reduced
   * motion), and `paint`, `gone` and `settled` have all been called before this returns.
   */
  retarget(layout: OrbitLayout, animate: boolean, stagger = animate): void {
    const keep = new Set(layout.nodes.map((node) => node.id))
    const entering: MotionNode[] = []

    for (const node of layout.nodes) {
      const target = { a: node.angle, r: node.radius }
      let motion = this.nodes.get(node.id)

      if (motion === undefined || motion.exiting) {
        // A new node starts at its parent, so it grows out of it; a node with no parent on screen starts at the centre.
        const parent = node.parent === null ? undefined : this.nodes.get(node.parent)
        const start = parent !== undefined && !parent.exiting ? { ...parent.cur } : { a: target.a, r: 0 }
        motion = {
          id: node.id,
          kind: node.kind,
          depth: node.depth,
          parent: node.parent,
          cur: motion?.exiting ? { ...motion.cur } : start,
          from: { a: 0, r: 0 },
          tgt: target,
          size: motion?.exiting ? motion.size : 0,
          sizeFrom: 0,
          sizeTo: node.size,
          opacity: motion?.exiting ? motion.opacity : 0,
          delay: 0,
          entering: motion === undefined,
          exiting: false,
        }
        this.nodes.set(node.id, motion)
        if (motion.entering) entering.push(motion)
      } else {
        motion.entering = false
        motion.depth = node.depth
        motion.parent = node.parent
        motion.kind = node.kind
        motion.tgt = target
        motion.sizeTo = node.size
      }

      // The centre keeps its angle (it has no radius to turn by).
      if (node.depth === 0) motion.tgt = { a: motion.cur.a, r: 0 }
      motion.from = { ...motion.cur }
      motion.sizeFrom = motion.size
      motion.exiting = false
      motion.delay = 0
    }

    // The bloom: the nodes that are new come in one after another, by ring and then by angle.
    entering.sort((a, b) => a.depth - b.depth || a.tgt.a - b.tgt.a)
    const step = entering.length === 0 ? 0 : Math.min(staggerStepMs, maxStaggerMs / entering.length)
    entering.forEach((node, index) => {
      node.delay = stagger ? firstDelayMs + index * step : 0
    })

    for (const node of this.nodes.values()) {
      if (keep.has(node.id)) continue
      node.exiting = true
      node.entering = false
      node.from = { ...node.cur }
      node.tgt = { a: node.cur.a, r: node.cur.r * 0.55 }
      node.sizeFrom = node.size
      node.sizeTo = 0
      node.delay = 0
    }

    this.clock?.stop()
    this.clock = null

    if (!animate) {
      this.duration = 1
      this.advance(Number.POSITIVE_INFINITY)
      return
    }

    this.duration = transitionMs
    this.clock = timer((elapsed) => this.advance(elapsed))
    // The first frame is drawn now, not on the next tick: a node that has just been added to the page is never seen
    // for a frame at the origin of the drawing.
    this.advance(0)
  }

  /** One frame at `elapsed` milliseconds after the last `retarget`. Public so a test can step the clock by hand. */
  advance(elapsed: number): void {
    let done = true
    for (const node of this.nodes.values()) {
      const t = Math.min(1, Math.max(0, (elapsed - node.delay) / this.duration))
      if (t < 1) done = false
      const e = easeCubicInOut(t)
      node.cur.a = lerpAngle(node.from.a, node.tgt.a, e)
      node.cur.r = node.from.r + (node.tgt.r - node.from.r) * e
      node.size = node.sizeFrom + (node.sizeTo - node.sizeFrom) * (node.entering ? pop(t) : e)
      node.opacity = node.exiting ? 1 - e : node.entering ? Math.min(1, t * 2.5) : 1
    }

    this.paint(this.nodes)
    if (!done) return

    this.clock?.stop()
    this.clock = null
    const left: string[] = []
    for (const [id, node] of this.nodes) {
      if (!node.exiting) continue
      left.push(id)
      this.nodes.delete(id)
    }
    if (left.length > 0) this.gone(left)
    this.settled()
  }

  /** Stops the clock. The view calls this when it goes away. */
  dispose(): void {
    this.clock?.stop()
    this.clock = null
  }
}
