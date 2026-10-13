import type { CreditRoleKey } from '../../app/creditRoles.ts'
import { sleeveFor } from '../art/sleeveSpec.ts'
import { declutter } from '../constellation/declutter.ts'
import type { GraphLink, GraphNode } from './graphModel.ts'

/** Past this many people the canvas stops labelling every node and keeps labels for hubs and the hovered node. */
export const LABEL_ALL_LIMIT = 300

/** A new node fades in over this long (spec section 12). */
export const ENTER_MS = 300

/** The colours the canvas draws with, read from the theme's tokens: it cannot take a CSS variable the way SVG can. */
export interface Palette {
  background: string
  text: string
  link: string
  /** The black of a record. */
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
  /** The hovered node and its neighbours: when set, everything else steps back (the focus mode, as in the orbit). */
  focusIds?: ReadonlySet<string> | null
  /** When each node first appeared, in `now`'s clock; a node with no entry is fully shown. */
  born: ReadonlyMap<string, number>
  now: number
  palette: Palette
  personCount: number
}

/** How far a node outside the focus steps back. */
const DIMMED = 0.12

/**
 * Which labels to draw (spec section 12): every node while the graph is small, and above 300 people only hubs and
 * the hovered or selected node, and the hovered node's neighbours. Songs are the anchors of the picture and are always
 * named. Zoomed far out nothing but the picture is readable, so only the hovered and selected labels remain.
 */
export function labelledNodes(
  scene: Pick<Scene, 'nodes' | 'hoveredId' | 'selectedId' | 'transform' | 'personCount'> & { focusIds?: ReadonlySet<string> | null },
): GraphNode[] {
  const { nodes, hoveredId, selectedId, transform, personCount, focusIds } = scene
  const crowded = personCount > LABEL_ALL_LIMIT
  const farOut = transform.k < 0.3

  return nodes.filter((node) => {
    if (node.id === hoveredId || node.id === selectedId) return true
    if (farOut) return false
    if (focusIds?.has(node.id) === true) return true
    if (node.kind === 'song') return true
    return !crowded || node.isHub
  })
}

function nodeLabel(node: GraphNode): string {
  return node.kind === 'song' ? node.title : node.name
}

/**
 * Draws one frame. It reads the scene and touches only the canvas context, so it can be tested with a recording
 * context and run on any thread that has one. Returns true while some node is still fading in.
 *
 * A song is a record (a black disc whose label is the colour of its generated sleeve), a person is a disc in the colour
 * of their main role, and a connector has a ring: the same marks as the SVG constellation, so the picture does not
 * change when the graph crosses the threshold.
 */
export function drawGraph(ctx: CanvasRenderingContext2D, scene: Scene): boolean {
  const { width, height, dpr, transform, palette } = scene
  const focus = scene.focusIds ?? null

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
  const stepBack = (id: string) => (focus !== null && !focus.has(id) ? DIMMED : 1)
  let animating = false

  ctx.lineWidth = 1.2 / transform.k
  for (const link of scene.links) {
    const from = byId.get(link.source)
    const to = byId.get(link.target)
    if (from === undefined || to === undefined) continue

    const alpha = Math.min(alphaOf(from.id), alphaOf(to.id))
    if (alpha < 1) animating = true
    const touchesFocus = focus === null || link.source === scene.hoveredId || link.target === scene.hoveredId
    ctx.globalAlpha = alpha * (touchesFocus ? 0.55 : 0.06)
    ctx.strokeStyle = palette.roles[link.roles[0] ?? 'other']
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

    ctx.globalAlpha = alpha * stepBack(node.id)
    if (node.kind === 'song') {
      ctx.fillStyle = palette.song
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fill()
      ctx.lineWidth = (emphasised ? 2.5 : 1) / transform.k
      ctx.strokeStyle = emphasised ? palette.selected : 'rgba(255,255,255,0.28)'
      ctx.setLineDash(node.status === 'loading' ? [4 / transform.k, 3 / transform.k] : [])
      ctx.stroke()
      ctx.setLineDash([])

      ctx.fillStyle = sleeveFor(node.mbid).background
      ctx.beginPath()
      ctx.arc(x, y, radius * 0.66, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = palette.song
      ctx.beginPath()
      ctx.arc(x, y, radius * 0.08, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.fillStyle = palette.roles[node.roles[0] ?? 'other']
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fill()
      if (emphasised || node.isHub) {
        ctx.lineWidth = (emphasised ? 3 : 1.6) / transform.k
        ctx.strokeStyle = emphasised ? palette.selected : palette.text
        ctx.beginPath()
        ctx.arc(x, y, radius + (node.isHub ? 3 : 0) / transform.k, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
  }

  ctx.fillStyle = palette.text
  ctx.strokeStyle = palette.background
  ctx.lineJoin = 'round'
  ctx.lineWidth = 4 / transform.k
  ctx.font = `600 ${12 / transform.k}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  // Most important first (the hovered node, then songs, then the larger people); a name that would cover one already
  // placed is left out, so what is drawn can be read.
  const wanted = labelledNodes(scene).sort(
    (a, b) =>
      Number(b.id === scene.hoveredId) - Number(a.id === scene.hoveredId) ||
      Number(b.kind === 'song') - Number(a.kind === 'song') ||
      b.r - a.r,
  )
  const hidden = declutter(
    wanted.map((node) => ({
      id: node.id,
      x: node.x ?? 0,
      y: (node.y ?? 0) + node.r + 4 / transform.k,
      width: ctx.measureText(nodeLabel(node)).width,
      height: 14 / transform.k,
    })),
  )
  for (const node of wanted) {
    if (hidden.has(node.id) && node.id !== scene.hoveredId) continue
    ctx.globalAlpha = alphaOf(node.id) * stepBack(node.id)
    const at = (node.y ?? 0) + node.r + 4 / transform.k
    // The halo first, so a name stays readable over the links behind it.
    ctx.strokeText(nodeLabel(node), node.x ?? 0, at)
    ctx.fillText(nodeLabel(node), node.x ?? 0, at)
  }

  ctx.restore()
  ctx.globalAlpha = 1
  return animating
}
