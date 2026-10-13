import { hierarchy, tree } from 'd3-hierarchy'
import { creditRoleStyles, type CreditRoleKey } from '../../app/creditRoles.ts'
import { primaryRole, type Workspace, type WorkspacePerson, type WorkspaceSong } from '../graph/workspaceModel.ts'

/** A song or a person, the two things the orbit can be centred on. `id` is the MBID. */
export interface NodeRef {
  type: 'song' | 'person'
  id: string
}

/** The key of a node in the layout: `s:<mbid>` or `p:<mbid>`, the same on every layout so a node can be moved, not redrawn. */
export const nodeKey = (ref: NodeRef) => `${ref.type === 'song' ? 's' : 'p'}:${ref.id}`

/** `song:<mbid>` or `person:<mbid>`, as written in the address (`?focus=`). Anything else is "no focus". */
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

export interface OrbitNode {
  /** `s:<mbid>`, `p:<mbid>` or `more`. */
  id: string
  kind: 'song' | 'person' | 'more'
  /** The MBID; empty for the "+N more" node. */
  ref: string
  depth: 0 | 1 | 2
  parent: string | null
  /** Radians, 0 pointing up and growing clockwise. */
  angle: number
  /** Pixels from the centre. */
  radius: number
  /** The drawn radius in pixels. */
  size: number
  label: string
  /** For the "+N more" node: how many people it stands for. */
  moreCount: number
}

export interface OrbitLink {
  id: string
  source: string
  target: string
  /** The person's main role on the song, which colours the link. */
  role: CreditRoleKey
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

export interface OrbitLayout {
  centre: NodeRef
  nodes: OrbitNode[]
  links: OrbitLink[]
  /** A node reachable from two parents is drawn once; the second route is a dashed cross-link. */
  crossLinks: { id: string; source: string; target: string }[]
  /** The radii of the dotted guide circles. */
  guides: number[]
  arcs: RoleArc[]
  radius: number
  /** The size of the node discs relative to the design size: smaller stages draw smaller nodes. */
  scale: number
  /** What is drawn, not where: it is the same across a resize, so a resize can snap instead of animate. */
  key: string
  /** True for a centre song that has no credits to show. */
  noCredits: boolean
}

export interface StageSize {
  width: number
  height: number
}

/** The angle moved the short way round, so a node that crosses the top does not swing across the whole circle. */
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
  kind: 'song' | 'person' | 'more'
  ref: string
  children: TreeNode[]
  moreCount?: number
}

function degreeOf(ws: Workspace, kind: 'song' | 'person', ref: string): number {
  return kind === 'person' ? (ws.personById.get(ref)?.songs.length ?? 0) : (ws.peopleBySong.get(ref)?.length ?? 0)
}

function nodeSize(kind: OrbitNode['kind'], depth: number, degree: number, scale: number): number {
  let size: number
  if (kind === 'more') size = 14
  else if (kind === 'song') size = depth === 0 ? 52 : depth === 1 ? 24 : 17
  else if (depth === 0) size = 36
  else if (depth === 1) size = Math.min(19, 9 + (degree - 1) * 3)
  else size = Math.min(15, 7 + (degree - 1) * 2.4)
  return size * (depth === 0 ? scale : Math.max(0.8, scale))
}

function shortLabel(text: string): string {
  return text.length > 24 ? `${text.slice(0, 22)}…` : text
}

function nameOf(ws: Workspace, kind: 'song' | 'person', ref: string): string {
  return kind === 'song' ? (ws.songById.get(ref)?.title ?? '') : (ws.personById.get(ref)?.name ?? '')
}

/**
 * The orbit around one centre (FR-VIEW-01): the centre, its neighbours on a ring, and their neighbours on a second ring,
 * as a radial tree. It is a pure function of the data and the stage's size, so it is tested without a DOM, and the
 * view animates between two layouts by moving each node from where it was to where it is now.
 */
export function layoutOrbit(ws: Workspace, centre: NodeRef, size: StageSize): OrbitLayout {
  const rootKey = nodeKey(centre)
  const kindOf = (ref: NodeRef) => ref.type

  // First ring: a song's people, or a person's songs.
  const ring1: NodeRef[] =
    centre.type === 'song'
      ? (ws.peopleBySong.get(centre.id) ?? []).map((person: WorkspacePerson) => ({ type: 'person', id: person.mbid }) as const)
      : (ws.personById.get(centre.id)?.songs ?? []).map((mbid) => ({ type: 'song', id: mbid }) as const)

  const neighboursOf = (ref: NodeRef): NodeRef[] =>
    ref.type === 'person'
      ? (ws.personById.get(ref.id)?.songs ?? []).map((mbid) => ({ type: 'song', id: mbid }) as const)
      : (ws.peopleBySong.get(ref.id) ?? []).map((person) => ({ type: 'person', id: person.mbid }) as const)

  const seen = new Set<string>([rootKey, ...ring1.map(nodeKey)])
  const crossRaw: { source: string; target: string }[] = []
  const rootChildren: TreeNode[] = ring1.map((ref) => ({ id: nodeKey(ref), kind: kindOf(ref), ref: ref.id, children: [] }))

  for (const parent of rootChildren) {
    for (const kid of neighboursOf({ type: parent.kind as 'song' | 'person', id: parent.ref })) {
      const key = nodeKey(kid)
      if (key === rootKey) continue
      if (seen.has(key)) {
        crossRaw.push({ source: parent.id, target: key })
        continue
      }
      seen.add(key)
      parent.children.push({ id: key, kind: kindOf(kid), ref: kid.id, children: [] })
    }
  }

  // The second ring is capped (spec section 12): connectors first, then by name, so the nodes kept are the useful ones.
  const secondRing = rootChildren.flatMap((parent) => parent.children)
  if (secondRing.length > maxSecondRing) {
    const keep = new Set(
      [...secondRing]
        .sort(
          (a, b) =>
            degreeOf(ws, b.kind as 'song' | 'person', b.ref) - degreeOf(ws, a.kind as 'song' | 'person', a.ref) ||
            nameOf(ws, a.kind as 'song' | 'person', a.ref).localeCompare(nameOf(ws, b.kind as 'song' | 'person', b.ref)),
        )
        .slice(0, maxSecondRing)
        .map((node) => node.id),
    )
    for (const parent of rootChildren) parent.children = parent.children.filter((child) => keep.has(child.id))
    const last = [...rootChildren].reverse().find((parent) => parent.children.length > 0) ?? rootChildren.at(-1)
    last?.children.push({ id: 'more', kind: 'more', ref: '', children: [], moreCount: secondRing.length - keep.size })
  }

  const shownSecond = new Set(rootChildren.flatMap((parent) => parent.children.map((child) => child.id)))
  const crossLinks = crossRaw
    .filter((link) => shownSecond.has(link.target))
    .map((link) => ({ id: `${link.source}>${link.target}`, ...link }))

  const root: TreeNode = { id: rootKey, kind: centre.type, ref: centre.id, children: rootChildren }
  const h = hierarchy(root)

  const radius = Math.max(120, Math.min(size.width, size.height) / 2 - (size.width < 560 ? 52 : 112))
  const scale = Math.min(1, Math.max(0.6, radius / 210))
  tree<TreeNode>()
    .size([Math.PI * 2, 1])
    .separation((a, b) => (a.parent === b.parent ? 1 : 1.6) / Math.max(1, a.depth))(h)
  const hasSecond = h.height >= 2
  const r1 = hasSecond ? radius * 0.5 : radius * 0.7

  const nodes: OrbitNode[] = h.descendants().map((d) => {
    const depth = d.depth as 0 | 1 | 2
    const data = d.data
    const degree = data.kind === 'more' ? 0 : degreeOf(ws, data.kind, data.ref)
    return {
      id: data.id,
      kind: data.kind,
      ref: data.ref,
      depth,
      parent: d.parent?.data.id ?? null,
      angle: depth === 0 ? 0 : (d.x ?? 0),
      radius: depth === 0 ? 0 : depth === 1 ? r1 : radius,
      size: nodeSize(data.kind, depth, degree, scale),
      label:
        depth === 0
          ? ''
          : data.kind === 'more'
            ? `+${data.moreCount ?? 0} more`
            : shortLabel(nameOf(ws, data.kind, data.ref)),
      moreCount: data.moreCount ?? 0,
    }
  })

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
      role: person !== undefined && songRef !== '' ? primaryRole(person, songRef) : 'other',
    }
  })

  const song: WorkspaceSong | undefined = centre.type === 'song' ? ws.songById.get(centre.id) : undefined
  const centreNode = nodes[0]!

  return {
    centre,
    nodes,
    links,
    crossLinks,
    guides: hasSecond ? [r1, radius] : [r1],
    arcs: centre.type === 'song' ? roleArcs(ws, centre.id, nodes, r1 - 30, centreNode.size) : [],
    radius,
    scale,
    key: `${rootKey}|${nodes.map((node) => node.id).join(',')}`,
    noCredits: song !== undefined && song.credits.length === 0 && song.creditsStatus !== 'loading',
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
    const fits = (a1 - a0) * radius >= text.length * 7.2 + 10
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
