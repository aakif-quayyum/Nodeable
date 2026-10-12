import type { CreditRoleKey } from '../../app/creditRoles.ts'
import type { GraphLink, GraphNode } from './graphModel.ts'

/** Past this many people the canvas stops labelling every node and keeps labels for hubs and the hovered node. */
export const LABEL_ALL_LIMIT = 300

/** A new node fades in over this long (spec section 12). */
export const ENTER_MS = 300

export interface Palette {
  background: string
  text: string
  link: string
  song: string
  selected: string
  roles: Record<CreditRoleKey, string>
}

export interface Transform {
  x: number
  y: number
  k: number
}

export interface Scene {
  /** Size in CSS pixels; the canvas itself is scaled by `dpr`. */
  width: number
  height: number
  dpr: number
  transform: Transform
  nodes: readonly GraphNode[]
  links: readonly GraphLink[]
  hoveredId: string | null
  selectedId: string | null
  /** When each node first appeared, in `now`'s clock; a node with no entry is fully shown. */
  born: ReadonlyMap<string, number>
  now: number
  palette: Palette
  personCount: number
}

/**
 * Which labels to draw (spec section 12): every node while the graph is small, and above 300 people only hubs and
 * the hovered or selected node. Songs are the anchors of the picture and are always named. Zoomed far out nothing
 * but the picture is readable, so only the hovered and selected labels remain.
 */
export function labelledNodes(scene: Pick<Scene, 'nodes' | 'hoveredId' | 'selectedId' | 'transform' | 'personCount'>): GraphNode[] {
  const { nodes, hoveredId, selectedId, transform, personCount } = scene
  const crowded = personCount > LABEL_ALL_LIMIT
  const farOut = transform.k < 0.45

  return nodes.filter((node) => {
    if (node.id === hoveredId || node.id === selectedId) return true
    if (farOut) return false
    if (node.kind === 'song') return true
    return !crowded || node.isHub
  })
}

function nodeLabel(node: GraphNode): string {
  return node.kind === 'song' ? node.title : node.name
}

function nodeColour(node: GraphNode, palette: Palette): string {
  if (node.kind === 'song') return palette.song
  return palette.roles[node.roles[0] ?? 'other']
}

/**
 * Draws one frame. It reads the scene and touches only the canvas context, so it can be tested with a recording
 * context and run on any thread that has one. Returns true while some node is still fading in.
 */
export function drawGraph(ctx: CanvasRenderingContext2D, scene: Scene): boolean {
  const { width, height, dpr, transform, palette } = scene

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = palette.background
  ctx.fillRect(0, 0, width, height)

  ctx.save()
  ctx.translate(transform.x, transform.y)
  ctx.scale(transform.k, transform.k)

  const byId = new Map(scene.nodes.map((node) => [node.id, node]))
  const alphaOf = (id: string) => {
    const born = scene.born.get(id)
    return born === undefined ? 1 : Math.min(1, Math.max(0, (scene.now - born) / ENTER_MS))
  }
  let animating = false

  ctx.lineWidth = 1 / transform.k
  for (const link of scene.links) {
    const from = byId.get(link.source)
    const to = byId.get(link.target)
    if (from === undefined || to === undefined) continue

    const alpha = Math.min(alphaOf(from.id), alphaOf(to.id))
    if (alpha < 1) animating = true
    ctx.globalAlpha = alpha * 0.45
    ctx.strokeStyle = palette.link
    ctx.beginPath()
    ctx.moveTo(from.x ?? 0, from.y ?? 0)
    ctx.lineTo(to.x ?? 0, to.y ?? 0)
    ctx.stroke()
  }

  for (const node of scene.nodes) {
    const alpha = alphaOf(node.id)
    if (alpha < 1) animating = true

    // A node grows from 60% of its size as it fades in, so it appears to settle rather than blink on.
    const radius = node.r * (0.6 + 0.4 * alpha)
    const x = node.x ?? 0
    const y = node.y ?? 0
    const emphasised = node.id === scene.selectedId || node.id === scene.hoveredId

    ctx.globalAlpha = alpha
    ctx.fillStyle = nodeColour(node, palette)
    ctx.beginPath()
    if (node.kind === 'song') {
      // Songs are squares and people are circles, so the two kinds differ by shape and not only by colour.
      ctx.rect(x - radius, y - radius, radius * 2, radius * 2)
    } else {
      ctx.arc(x, y, radius, 0, Math.PI * 2)
    }
    ctx.fill()

    const hub = node.kind === 'person' && node.isHub
    if (emphasised || hub || (node.kind === 'song' && node.status === 'loading')) {
      ctx.lineWidth = (emphasised ? 3 : 2) / transform.k
      ctx.strokeStyle = emphasised ? palette.selected : palette.text
      ctx.setLineDash(node.kind === 'song' && node.status === 'loading' ? [4 / transform.k, 3 / transform.k] : [])
      ctx.stroke()
      ctx.setLineDash([])
    }
  }

  ctx.globalAlpha = 1
  ctx.fillStyle = palette.text
  ctx.font = `${12 / transform.k}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (const node of labelledNodes(scene)) {
    ctx.globalAlpha = alphaOf(node.id)
    ctx.fillText(nodeLabel(node), node.x ?? 0, (node.y ?? 0) + node.r + 3 / transform.k)
  }

  ctx.restore()
  ctx.globalAlpha = 1
  return animating
}
