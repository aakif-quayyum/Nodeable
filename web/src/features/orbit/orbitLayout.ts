import { hierarchy, tree } from 'd3-hierarchy'
import { creditRoleStyles, type CreditRoleKey } from '../../app/creditRoles.ts'
import { fitName } from './labelFit.ts'
import { primaryRole, type Workspace, type WorkspacePerson, type WorkspaceSong } from '../graph/workspaceModel.ts'

/**
 * What the orbit can be centred on: the whole graph (the default, FR-VIEW-04), a song or a person. `id` is the MBID,
 * and empty for the graph.
 */
export interface NodeRef {
  type: 'graph' | 'song' | 'person'
  id: string
}

/** The whole graph as a centre: the first place on every trail, so there is always a way back to the overview. */
export const rootRef: NodeRef = { type: 'graph', id: '' }

/** The key of a node in the layout: `g:`, `s:<mbid>` or `p:<mbid>`, the same on every layout so a node can be moved, not redrawn. */
export const nodeKey = (ref: NodeRef) => (ref.type === 'graph' ? 'g:' : `${ref.type === 'song' ? 's' : 'p'}:${ref.id}`)

/** `song:<mbid>` or `person:<mbid>`, as written in the address (`?focus=`). Anything else is "no focus", the whole graph. */
export function parseFocus(value: string | null): NodeRef | null {
  if (value === null) return null
  const [type, ...rest] = value.split(':')
  const id = rest.join(':')
  if ((type === 'song' || type === 'person') && id !== '') return { type, id }
  return null
}

export const focusParam = (ref: NodeRef) => `${ref.type}:${ref.id}`

/** The second ring shows at most this many nodes; the rest are one "+N more" node (spec section 12). */
export const maxSecondRing = 60

/** How many nodes each ring keeps before the rest become one "+N more" node. */
interface Caps {
  first: number
  second: number
}

/** The radius of a node's hit area at least: 12 px, a 24 px target. */
const minHit = 12

/** Above this many nodes on the first ring their names are left off (the tooltip and the accessible name still give them). */
const maxLabelledFirstRing = 16

export interface OrbitNode {
  /** `g:`, `s:<mbid>`, `p:<mbid>` or `more`. */
  id: string
  kind: 'graph' | 'song' | 'person' | 'more'
  /** The MBID; empty for the graph and for the "+N more" node. */
  ref: string
  depth: 0 | 1 | 2
  parent: string | null
  /** Radians, 0 pointing up and growing clockwise. */
  angle: number
  /** Pixels from the centre. */
  radius: number
  /** The drawn radius in pixels. */
  size: number
  /**
   * The radius, in pixels, of the area that takes a press or a hover: at least 12 (a 24 px target, WCAG 2.2 2.5.8) and
   * never less than the drawn disc, and the areas of one ring do not overlap. Smaller only where a ring that cannot be
   * thinned (the whole graph's songs) has no room for 24 px each.
   */
  hit: number
  /** The name as drawn, one line or two joined with a space; '' when there is no room for one. */
  label: string
  /** The lines the name is drawn in: one, or two when wrapping at a word beat cutting (spec section 12). */
  lines: string[]
  /** Where the name sits against the node: under it, above it, beside it, or along the radius (second ring). */
  place: LabelPlace
  /** For the "+N more" node: how many people it stands for. */
  moreCount: number
}

export type LabelPlace = 'below' | 'above' | 'start' | 'end' | 'radial'

export interface OrbitLink {
  id: string
  source: string
  target: string
  /** The person's main role on the song, which colours the link; `plain` for the graph's own links to its songs. */
  role: CreditRoleKey | 'plain'
}

export interface RoleArc {
  id: string
  role: CreditRoleKey
  a0: number
  a1: number
  radius: number
  /** The role's name in capitals, or null when the arc is too short to carry it. */
  label: string | null
  /** True on the lower half, where the text is set the other way so it never reads upside down. */
  flip: boolean
}

export type EmptyCentre = 'noCredits' | 'filtered'

export interface OrbitLayout {
  centre: NodeRef
  nodes: OrbitNode[]
  links: OrbitLink[]
  /** A node reachable from two parents is drawn once; the second route is a dashed cross-link. */
  crossLinks: { id: string; source: string; target: string }[]
  /** The radii of the dotted guide circles. */
  guides: number[]
  arcs: RoleArc[]
  /** The outer ring's radius in pixels: the tree is fitted to the stage, so this is what the stage allows. */
  radius: number
  /** Where the centre goes in the stage: the middle of what the breadcrumbs and the legend leave free. */
  origin: { x: number; y: number }
  /** The node discs' size relative to the design size. */
  scale: number
  /** The labels' size relative to 12 px. Never below 1: no label is smaller than 12 px. */
  fontScale: number
  /** What is drawn, not where: it is the same across a resize, so a resize can snap instead of animate. */
  key: string
  /** A centre song with nothing to draw: it has no credits at all, or none that the filters and hidden people leave. */
  empty: EmptyCentre | null
}

export interface StageSize {
  width: number
  height: number
}

/** The angle moved the short way round, so a node that crosses the top does not swing across the whole circle. */
// LEARN: LG-03R polar-interpolation | Interpolating an angle linearly can swing the long way round the circle; the difference is wrapped into [-π, π) first, so a node that crosses the top takes the short arc, which is what makes a re-root read as a turn instead of a scramble
export function lerpAngle(from: number, to: number, t: number): number {
  const turn = Math.PI * 2
  const delta = ((((to - from + Math.PI) % turn) + turn) % turn) - Math.PI
  return from + delta * t
}

/** Polar (0 up, clockwise) to the SVG's cartesian coordinates around the centre. */
export function polarToXY(radius: number, angle: number): [number, number] {
  return [radius * Math.sin(angle), -radius * Math.cos(angle)]
}

interface TreeNode {
  id: string
  kind: OrbitNode['kind']
  ref: string
  children: TreeNode[]
  moreCount?: number
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

function degreeOf(ws: Workspace, kind: OrbitNode['kind'], ref: string): number {
  if (kind === 'person') return ws.personById.get(ref)?.songs.length ?? 0
  if (kind === 'song') return ws.peopleBySong.get(ref)?.length ?? 0
  return 0
}

/** A node's drawn radius at design size 1; the layout multiplies by its scale. */
function baseSize(kind: OrbitNode['kind'], depth: number, degree: number): number {
  if (kind === 'more') return 14
  if (kind === 'graph') return 46
  if (kind === 'song') return depth === 0 ? 52 : depth === 1 ? 24 : 17
  if (depth === 0) return 36
  if (depth === 1) return Math.min(19, 9 + (degree - 1) * 3)
  return Math.min(15, 7 + (degree - 1) * 2.4)
}

function nameOf(ws: Workspace, kind: OrbitNode['kind'], ref: string): string {
  if (kind === 'song') return ws.songById.get(ref)?.title ?? ''
  if (kind === 'person') return ws.personById.get(ref)?.name ?? ''
  return ''
}

const asRef = (kind: 'song' | 'person', id: string): NodeRef => ({ type: kind, id })

/** What a node is joined to: the graph's songs, a song's people, a person's songs. */
function neighboursOf(ws: Workspace, ref: NodeRef): NodeRef[] {
  if (ref.type === 'graph') return ws.songs.map((song) => asRef('song', song.mbid))
  if (ref.type === 'song') return (ws.peopleBySong.get(ref.id) ?? []).map((person: WorkspacePerson) => asRef('person', person.mbid))
  return (ws.personById.get(ref.id)?.songs ?? []).map((mbid) => asRef('song', mbid))
}

/** A point on the drawing, and a fixed number of pixels beyond it: where a disc's edge or a label's end lands. */
interface Extent {
  px: number
  py: number
  ex: number
  ey: number
}

/** The box the extents fill when the tree has this radius: each point is `radius * (px, py) + (ex, ey)`. */
function boundsOf(extents: readonly Extent[], radius: number) {
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const extent of extents) {
    const x = radius * extent.px + extent.ex
    const y = radius * extent.py + extent.ey
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  return { minX, maxX, minY, maxY }
}

/**
 * The largest radius at which the tree, names included, fits a box of `width` by `height`. The fixed pixel parts of
 * an extent (a disc's size, a name's length) do not scale with the radius, so there is no closed form; the box grows
 * with the radius, so a bisection finds where it stops fitting. It fits the box the extents really fill, not a circle
 * around the centre: a tree whose names all point up is moved down instead of being shrunk to leave room below.
 */
function fitBox(extents: readonly Extent[], width: number, height: number): number {
  let low = 40
  let high = 900
  for (let step = 0; step < 28; step += 1) {
    const mid = (low + high) / 2
    const box = boundsOf(extents, mid)
    if (box.maxX - box.minX <= width && box.maxY - box.minY <= height) low = mid
    else high = mid
  }
  return low
}

/**
 * The orbit around one centre (FR-VIEW-01, FR-VIEW-04): the centre, its neighbours on a ring, and their neighbours on a
 * second ring, as a radial tree, fitted to the stage it is drawn on. It is a pure function of the data and the stage's
 * size, so it is tested without a DOM, and the view animates between two layouts by moving each node from where it was
 * to where it is now.
 */
// LEARN: LG-03R radial-tree | d3-hierarchy's tree() gives every node an x in [0, 2π] and a depth; reading x as an angle and depth as a radius turns a tree layout into an orbit, and because the layout is a pure function of the data and the stage size it is tested without a DOM
export function layoutOrbit(ws: Workspace, centre: NodeRef, size: StageSize): OrbitLayout {
  // A ring that cannot hold its nodes' 24 px hit areas without overlap is asked to keep fewer (the rest are "+N more"),
  // and the layout is made again; the caps only go down, so this ends.
  let caps: Caps = { first: Number.POSITIVE_INFINITY, second: maxSecondRing }
  for (let attempt = 0; ; attempt += 1) {
    const built = buildOrbit(ws, centre, size, caps, attempt >= 5)
    if (built.layout !== null) return built.layout
    caps = built.overflow ?? caps
  }
}

function buildOrbit(
  ws: Workspace,
  centre: NodeRef,
  size: StageSize,
  caps: Caps,
  final: boolean,
): { layout: OrbitLayout | null; overflow: Caps | null } {
  const rootKey = nodeKey(centre)

  let ring1 = neighboursOf(ws, centre)
  // The first ring of a song or a person can be thinned; the whole graph's songs are never hidden (FR-VIEW-04).
  let moreFirst = 0
  if (centre.type !== 'graph' && ring1.length > caps.first) {
    const ranked = [...ring1].sort(
      (a, b) => degreeOf(ws, b.type, b.id) - degreeOf(ws, a.type, a.id) || nameOf(ws, a.type, a.id).localeCompare(nameOf(ws, b.type, b.id)),
    )
    const keep = new Set(ranked.slice(0, Math.max(1, caps.first)).map(nodeKey))
    moreFirst = ring1.length - keep.size
    ring1 = ring1.filter((ref) => keep.has(nodeKey(ref)))
  }
  const seen = new Set<string>([rootKey, ...ring1.map(nodeKey)])
  const crossRaw: { source: string; target: string }[] = []
  const rootChildren: TreeNode[] = ring1.map((ref) => ({ id: nodeKey(ref), kind: ref.type as 'song' | 'person', ref: ref.id, children: [] }))

  for (const parent of rootChildren) {
    for (const kid of neighboursOf(ws, asRef(parent.kind as 'song' | 'person', parent.ref))) {
      const key = nodeKey(kid)
      if (key === rootKey) continue
      if (seen.has(key)) {
        crossRaw.push({ source: parent.id, target: key })
        continue
      }
      seen.add(key)
      parent.children.push({ id: key, kind: kid.type, ref: kid.id, children: [] })
    }
  }

  // The second ring is capped (spec section 12): connectors first, then by name, so the nodes kept are the useful ones.
  const secondRing = rootChildren.flatMap((parent) => parent.children)
  if (secondRing.length > caps.second) {
    const keep = new Set(
      [...secondRing]
        .sort((a, b) => degreeOf(ws, b.kind, b.ref) - degreeOf(ws, a.kind, a.ref) || nameOf(ws, a.kind, a.ref).localeCompare(nameOf(ws, b.kind, b.ref)))
        .slice(0, Math.max(1, caps.second))
        .map((node) => node.id),
    )
    for (const parent of rootChildren) parent.children = parent.children.filter((child) => keep.has(child.id))
    const last = [...rootChildren].reverse().find((parent) => parent.children.length > 0) ?? rootChildren.at(-1)
    last?.children.push({ id: 'more', kind: 'more', ref: '', children: [], moreCount: secondRing.length - keep.size })
  }

  // What was thinned from the first ring is one more node on it, after the people that were kept.
  if (moreFirst > 0) rootChildren.push({ id: 'more:first', kind: 'more', ref: '', children: [], moreCount: moreFirst })

  const shownSecond = new Set(rootChildren.flatMap((parent) => parent.children.map((child) => child.id)))
  const crossLinks = crossRaw
    .filter((link) => shownSecond.has(link.target))
    .map((link) => ({ id: `${link.source}>${link.target}`, ...link }))

  const root: TreeNode = { id: rootKey, kind: centre.type, ref: centre.id, children: rootChildren }
  const h = hierarchy(root)
  tree<TreeNode>()
    .size([Math.PI * 2, 1])
    .separation((a, b) => (a.parent === b.parent ? 1 : 1.6) / Math.max(1, a.depth))(h)

  // ---- Fitting the tree to the stage ------------------------------------------------------------------------------
  // The breadcrumbs sit along the top and the legend along the bottom; the orbit is fitted to what they leave free.
  const compact = size.width < 560
  const side = 14
  const top = compact ? 118 : 54
  const bottom = compact ? 96 : 64
  const halfW = Math.max(40, size.width / 2 - side)
  const halfH = Math.max(40, (size.height - top - bottom) / 2)

  const hasSecond = h.height >= 2
  const first = rootChildren.length
  const ratio1 = hasSecond ? (first > 24 ? 0.62 : 0.55) : 0.7

  // Design size from the room there is, so a big stage draws bigger nodes and bigger names, and a small one smaller
  // nodes but never smaller than 12 px names.
  const designScale = clamp(Math.min(halfW, halfH) / 230, 0.7, 1.5)
  const fontScale = clamp(designScale, 1, 1.2)
  const fontPx = 12 * fontScale
  const textWidth = (chars: number) => chars * 0.56 * fontPx

  // The whole graph: each song has an equal wedge of the circle, and its people fan out inside it, so songs that share
  // nobody sit apart instead of being pushed together by the tree's leaf spacing.
  const wedgeAngles = new Map<string, number>()
  if (centre.type === 'graph' && first > 0) {
    const wedge = (Math.PI * 2) / first
    rootChildren.forEach((child, index) => {
      const mid = first === 1 ? Math.PI / 2 : (index + 0.5) * wedge
      wedgeAngles.set(child.id, mid)
      const count = child.children.length
      const step = Math.min(wedge / Math.max(1, count), 0.34)
      child.children.forEach((grandchild, at) => wedgeAngles.set(grandchild.id, mid + (at - (count - 1) / 2) * step))
    })
  }

  const described = h.descendants().map((d) => {
    const data = d.data
    const depth = d.depth as 0 | 1 | 2
    const full = data.kind === 'more' ? `+${data.moreCount ?? 0} more` : nameOf(ws, data.kind, data.ref)
    const angle = depth === 0 ? 0 : (wedgeAngles.get(data.id) ?? d.x ?? 0)
    return { d, data, depth, angle, full, degree: degreeOf(ws, data.kind, data.ref) }
  })

  // A song's people ring has the role arcs inside it, so its names go on the outer side of each node, where they
  // cannot run across an arc's text; the other rings put them under the node.
  const outward1 = centre.type === 'song'
  const lineHeight = fontPx * 1.15
  const placeFirst = (angle: number): LabelPlace => {
    if (!outward1) return 'below'
    const dx = Math.sin(angle)
    if (Math.abs(dx) > 0.5) return dx > 0 ? 'start' : 'end'
    return Math.cos(angle) > 0 ? 'above' : 'below'
  }

  /** What the tree fills when second-ring names keep at least `chars` characters (null: no second-ring names). */
  const extentsFor = (chars: number | null): Extent[] => {
    const extents: Extent[] = []
    for (const node of described) {
      if (node.depth === 0) {
        const disc = baseSize(node.data.kind, 0, 0) * designScale
        extents.push({ px: 0, py: 0, ex: disc, ey: disc }, { px: 0, py: 0, ex: -disc, ey: -disc })
        continue
      }
      const unit = node.depth === 1 ? ratio1 : 1
      const [px, py] = polarToXY(unit, node.angle)
      const disc = baseSize(node.data.kind, node.depth, node.degree) * designScale
      extents.push({ px, py, ex: disc, ey: disc }, { px, py, ex: -disc, ey: -disc })

      if (node.depth === 2) {
        if (chars === null || node.full === '') continue
        // Set along the radius, outward from the disc: the end of the name is `reach` beyond the node in that direction.
        const reach = disc + 6 + textWidth(Math.min(chars, node.full.length))
        const dx = Math.sin(node.angle)
        const dy = -Math.cos(node.angle)
        extents.push({ px, py, ex: dx * reach + (dx >= 0 ? 7 : -7), ey: dy * reach + (dy >= 0 ? 7 : -7) })
        continue
      }

      if (first > maxLabelledFirstRing || node.full === '') continue
      const width = textWidth(Math.min(22, node.full.length))
      const place = placeFirst(node.angle)
      if (place === 'start') extents.push({ px, py, ex: disc + 6 + width, ey: 10 })
      else if (place === 'end') extents.push({ px, py, ex: -(disc + 6 + width), ey: 10 })
      else if (place === 'above') extents.push({ px, py, ex: width / 2, ey: -(disc + 12 + lineHeight) }, { px, py, ex: -width / 2, ey: -(disc + 12 + lineHeight) })
      else extents.push({ px, py, ex: width / 2, ey: disc + 20 + lineHeight }, { px, py, ex: -width / 2, ey: disc + 20 + lineHeight })
    }
    return extents
  }

  // The tree is made as large as the stage allows with at least a short name (`shortest` characters) at the top and
  // bottom, where a name runs up and down and the stage is shortest. When that costs too much of the radius (a small
  // stage), the second ring goes without names: the tooltip and the accessible name still give them.
  const shortest = 9
  const named = extentsFor(shortest)
  const unnamed = extentsFor(null)
  const withNames = fitBox(named, 2 * halfW, 2 * halfH)
  const withoutNames = fitBox(unnamed, 2 * halfW, 2 * halfH)
  const ringNames = hasSecond && withNames >= 0.6 * withoutNames
  const radius = clamp(ringNames ? withNames : withoutNames, 70, 560)
  const r1 = radius * ratio1

  // The centre goes where the box the tree fills sits in the middle of what the breadcrumbs and the legend leave free.
  const filled = boundsOf(ringNames ? named : unnamed, radius)
  const origin = {
    x: size.width / 2 - (filled.minX + filled.maxX) / 2,
    y: top + halfH - (filled.minY + filled.maxY) / 2,
  }

  // The nodes are no bigger than the tree can carry: the same scale as the radius, and no bigger than the design size.
  const scale = clamp(Math.min(designScale, radius / 180), 0.7, 1.5)
  const secondCount = described.filter((node) => node.depth === 2).length
  const spacing1 = first > 0 ? (Math.PI * 2 * r1) / first : Number.POSITIVE_INFINITY
  const spacing2 = secondCount > 0 ? (Math.PI * 2 * radius) / secondCount : Number.POSITIVE_INFINITY

  const nodes: OrbitNode[] = described.map((node) => {
    let discSize = baseSize(node.data.kind, node.depth, node.degree) * scale
    // On a crowded ring a node takes no more than its share of the circle, so neighbours do not overlap.
    if (node.depth === 1) discSize = Math.min(discSize, Math.max(6.5, spacing1 * 0.44))
    if (node.depth === 2) discSize = Math.min(discSize, Math.max(5, spacing2 * 0.44))
    return {
      id: node.data.id,
      kind: node.data.kind,
      ref: node.data.ref,
      depth: node.depth,
      parent: node.d.parent?.data.id ?? null,
      angle: node.angle,
      radius: node.depth === 0 ? 0 : node.depth === 1 ? r1 : radius,
      size: discSize,
      hit: discSize,
      label: '',
      lines: [],
      place: node.depth === 2 ? 'radial' : 'below',
      moreCount: node.data.moreCount ?? 0,
    }
  })

  // ---- Hit areas (WCAG 2.2, 2.5.8) ----------------------------------------------------------------------------------
  // Each node takes a press in a circle of at least 12 px radius (24 px across) and never less than its drawn disc. The
  // circles of one ring may not overlap, so the nodes of a ring are moved apart along it; when they cannot all fit, the
  // smallest nodes (fewest songs, then name) go into "+N more" and the layout is made again. A song's disc is not a
  // person's: the whole graph's songs are never thinned, so on a crowded ring they share the circle.
  const overflow: Caps = { ...caps }
  let overflowed = false
  for (const depth of [1, 2] as const) {
    const ring = nodes.filter((node) => node.depth === depth)
    if (ring.length === 0) continue
    const ringRadius = depth === 1 ? r1 : radius
    for (const node of ring) node.hit = Math.max(minHit, node.size)
    if (spreadRing(ring, ringRadius)) continue

    const thinnable = depth === 2 || centre.type !== 'graph'
    if (thinnable && !final) {
      const mean = ring.reduce((sum, node) => sum + node.hit, 0) / ring.length
      const fits = Math.floor(Math.PI / Math.asin(Math.min(1, mean / ringRadius)))
      const keepable = Math.max(1, fits - 1)
      const now = depth === 1 ? first - (moreFirst > 0 ? 1 : 0) : ring.length - (ring.some((node) => node.kind === 'more') ? 1 : 0)
      if (keepable < now) {
        if (depth === 1) overflow.first = keepable
        else overflow.second = keepable
        overflowed = true
        continue
      }
    }
    shrinkHits(ring, ringRadius)
  }
  if (overflowed) return { layout: null, overflow }

  // Each name gets the room its own node has. A second-ring name runs outward along the radius to the stage's edge, so
  // on the sides it can be long and at the top and bottom it is short; a first-ring name is no wider than the room
  // beside it and the gap to the next node on the same line. A name that does not fit is wrapped into two lines at a
  // word boundary where there is the room (the neighbours are far enough apart), and cut at a word only after that.
  const charWidth = textWidth(1)
  // The free part of the stage, in the drawing's own coordinates (the centre is at 0, 0).
  const boxLeft = side - origin.x
  const boxRight = size.width - side - origin.x
  const boxTop = top - origin.y
  const boxBottom = size.height - bottom - origin.y

  const secondAngles = nodes.filter((node) => node.depth === 2).map((node) => node.angle).sort((a, b) => a - b)
  const gapAt = (angle: number) => {
    const turn = Math.PI * 2
    let gap = turn
    for (const other of secondAngles) {
      if (other === angle) continue
      const between = Math.abs(((other - angle + Math.PI) % turn + turn) % turn - Math.PI)
      gap = Math.min(gap, between)
    }
    return gap * radius
  }

  // Where each first-ring name sits is known from the angle alone, so every node can look at its neighbours' places.
  for (const node of nodes) if (node.depth === 1) node.place = placeFirst(node.angle)

  nodes.forEach((node, index) => {
    const full = described[index]!.full
    if (node.depth === 0 || full === '') return
    const [x, y] = polarToXY(node.radius, node.angle)

    if (node.depth === 2) {
      if (!ringNames) return
      const dx = Math.sin(node.angle)
      const dy = -Math.cos(node.angle)
      const toEdge = Math.min(
        Math.abs(dx) < 1e-6 ? Number.POSITIVE_INFINITY : ((dx > 0 ? boxRight : boxLeft) - x) / dx,
        Math.abs(dy) < 1e-6 ? Number.POSITIVE_INFINITY : ((dy > 0 ? boxBottom : boxTop) - y) / dy,
      )
      const cap = Math.min(40, Math.floor((toEdge - node.size - 6 - 7) / charWidth))
      node.lines = fitName(full, cap, gapAt(node.angle) >= 2 * lineHeight + 4)
    } else if (node.depth === 1) {
      if (first > maxLabelledFirstRing) return
      node.place = placeFirst(node.angle)
      let room: number
      if (node.place === 'start') room = boxRight - (x + node.size + 6) - 4
      else if (node.place === 'end') room = x - node.size - 6 - boxLeft - 4
      else {
        room = 2 * Math.min(boxRight - x, x - boxLeft) - 8
        for (const other of nodes) {
          if (other === node || other.depth !== 1) continue
          const [ox, oy] = polarToXY(other.radius, other.angle)
          if (Math.abs(oy - y) < 2 * lineHeight + 10) room = Math.min(room, Math.abs(ox - x) - 8)
        }
      }
      // Beside its node a name may take two lines only where the next name above or below it is far enough away.
      let twoLines = true
      if (node.place === 'start' || node.place === 'end') {
        for (const other of nodes) {
          if (other === node || other.depth !== 1 || other.place !== node.place) continue
          const [, oy] = polarToXY(other.radius, other.angle)
          if (Math.abs(oy - y) < 2 * lineHeight + 4) twoLines = false
        }
      }
      node.lines = fitName(full, Math.min(30, Math.floor(room / charWidth)), twoLines)
    } else {
      node.lines = [full]
    }
    node.label = node.lines.join(' ')
  })

  // The centre leaves room for the first ring (and, for a song, the role arcs inside it).
  const ringMax = Math.max(0, ...nodes.filter((node) => node.depth === 1).map((node) => node.size))
  const arcRadius = r1 - ringMax - 8
  const centreNode = nodes[0]!
  centreNode.size = Math.max(20, Math.min(centreNode.size, hasSecond || first > 0 ? arcRadius - 12 : centreNode.size))

  const links: OrbitLink[] = h.links().map((link) => {
    const source = link.source.data
    const target = link.target.data
    const songRef = source.kind === 'song' ? source.ref : target.kind === 'song' ? target.ref : ''
    const personRef = source.kind === 'person' ? source.ref : target.kind === 'person' ? target.ref : ''
    const person = ws.personById.get(personRef)
    return {
      id: `${source.id}>${target.id}`,
      source: source.id,
      target: target.id,
      role: source.kind === 'graph' ? 'plain' : person !== undefined && songRef !== '' ? primaryRole(person, songRef) : 'other',
    }
  })

  const song: WorkspaceSong | undefined = centre.type === 'song' ? ws.songById.get(centre.id) : undefined
  let empty: EmptyCentre | null = null
  if (song !== undefined && song.creditsStatus !== 'loading' && song.credits.length === 0) {
    empty = song.totalCredits === 0 ? 'noCredits' : 'filtered'
  }
  // A centre with nothing around it is drawn by the stage as a large cover, not as a dot with a ring.
  if (empty !== null) centreNode.size = 0.01

  return {
    layout: {
      centre,
      nodes,
      links,
      crossLinks,
      guides: empty !== null ? [] : hasSecond ? [r1, radius] : [r1],
      arcs: centre.type === 'song' && empty === null ? roleArcs(ws, centre.id, nodes, arcRadius, centreNode.size) : [],
      radius,
      origin,
      scale,
      fontScale,
      key: `${rootKey}|${nodes.map((node) => node.id).join(',')}`,
      empty,
    },
    overflow: null,
  }
}

/**
 * Moves the nodes of one ring apart along its circle until the circles of their hit areas, `hit` in radius, no longer
 * overlap, keeping their order. Each pair needs the angle at which two such circles just touch on a ring of this radius
 * (a chord of `hit + hit`); the nodes are pushed apart a pair at a time until every gap has it. False when the gaps
 * cannot all be had at once, which is when the ring holds more than its circumference allows.
 */
// LEARN: LG-03R hit-areas | A target's size is what takes the press, not what is drawn: each node gets an invisible circle of at least 12 px radius, and because circles that overlap make a press ambiguous the layout spreads a ring until they do not, and thins the ring when its circumference cannot hold them (WCAG 2.2, 2.5.8)
function spreadRing(ring: OrbitNode[], radius: number): boolean {
  const n = ring.length
  if (n < 2) return true
  const turn = Math.PI * 2
  const order = ring.map((node) => ({ node, angle: ((node.angle % turn) + turn) % turn })).sort((a, b) => a.angle - b.angle)
  const start = order.map((entry) => entry.angle)
  const need = order.map((entry, index) => {
    const next = order[(index + 1) % n]!
    return 2 * Math.asin(Math.min(1, (entry.node.hit + next.node.hit) / (2 * radius)))
  })
  if (need.reduce((sum, value) => sum + value, 0) > turn - 1e-6) return false

  const pos = [...start]
  const gapAfter = (index: number) => (index === n - 1 ? pos[0]! + turn - pos[index]! : pos[index + 1]! - pos[index]!)
  for (let pass = 0; pass < 300; pass += 1) {
    let moved = false
    for (let index = 0; index < n; index += 1) {
      const deficit = need[index]! - gapAfter(index)
      if (deficit <= 1e-9) continue
      const next = (index + 1) % n
      pos[index] = pos[index]! - deficit / 2
      pos[next] = pos[next]! + deficit / 2
      moved = true
    }
    if (!moved) break
  }
  // Close to full the pushing converges slowly; then the nodes are given exactly what they need plus an equal share of
  // what is left over, in their order, which always holds.
  let short = false
  for (let index = 0; index < n; index += 1) if (need[index]! - gapAfter(index) > 1e-9) short = true
  if (short) {
    const slack = (turn - need.reduce((sum, value) => sum + value, 0)) / n
    let at = start[0]!
    for (let index = 0; index < n; index += 1) {
      pos[index] = at
      at += need[index]! + slack
    }
  }

  order.forEach((entry, index) => {
    entry.node.angle += pos[index]! - start[index]!
  })
  return true
}

/** The fallback for a ring that cannot be thinned: each hit area is no bigger than half the way to its nearest neighbour. */
function shrinkHits(ring: OrbitNode[], radius: number): void {
  for (const node of ring) {
    let nearest = Number.POSITIVE_INFINITY
    for (const other of ring) {
      if (other === node) continue
      const between = Math.abs((((other.angle - node.angle + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI)
      nearest = Math.min(nearest, 2 * radius * Math.sin(Math.min(between, Math.PI) / 2))
    }
    node.hit = Math.min(node.hit, Math.max(4, nearest / 2))
  }
}

/**
 * The coloured arcs inside the first ring that name the roles of a song's people (FR-VIEW-01). The first ring is
 * ordered by main role, so consecutive people with the same role are one group and one arc; the arc stops half way to
 * the next group, so the arcs never overlap.
 */
function roleArcs(ws: Workspace, songMbid: string, nodes: OrbitNode[], radius: number, centreSize: number): RoleArc[] {
  if (radius < centreSize + 10) return []

  const kids = nodes.filter((node) => node.depth === 1 && node.kind === 'person').sort((a, b) => a.angle - b.angle)
  if (kids.length === 0) return []

  const groups: { role: CreditRoleKey; min: number; max: number }[] = []
  for (const kid of kids) {
    const person = ws.personById.get(kid.ref)
    const role = person === undefined ? 'other' : primaryRole(person, songMbid)
    const last = groups.at(-1)
    if (last !== undefined && last.role === role) last.max = kid.angle
    else groups.push({ role, min: kid.angle, max: kid.angle })
  }

  const turn = Math.PI * 2
  const arcs: RoleArc[] = []
  groups.forEach((group, index) => {
    const prev = groups[(index - 1 + groups.length) % groups.length]!
    const next = groups[(index + 1) % groups.length]!
    const single = groups.length === 1
    const leftLimit = single ? group.min - Math.PI : index === 0 ? (prev.max - turn + group.min) / 2 : (prev.max + group.min) / 2
    const rightLimit = single
      ? group.max + Math.PI
      : index === groups.length - 1
        ? (group.max + next.min + turn) / 2
        : (group.max + next.min) / 2
    const a0 = Math.max(group.min - 0.16, leftLimit + 0.05)
    const a1 = Math.min(group.max + 0.16, rightLimit - 0.05)
    if (a1 <= a0) return

    const text = creditRoleStyles[group.role].label.toUpperCase()
    const fits = (a1 - a0) * radius >= text.length * 8.4 + 12
    const mid = ((((a0 + a1) / 2) % turn) + turn) % turn
    arcs.push({
      id: `${group.role}-${index}`,
      role: group.role,
      a0,
      a1,
      radius,
      label: fits ? text : null,
      flip: mid > Math.PI / 2 && mid < Math.PI * 1.5,
    })
  })
  return arcs
}
