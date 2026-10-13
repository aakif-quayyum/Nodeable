import { arc, linkRadial, pie } from 'd3-shape'
import {
  memo,
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
} from 'react'
import { creditRoleStyles, type CreditRoleKey } from '../../app/creditRoles.ts'
import { useReducedMotion } from '../../motion/useReducedMotion.ts'
import { sleeveFor } from '../art/sleeveSpec.ts'
import { rolesOnSong, type Workspace } from '../graph/workspaceModel.ts'
import { layoutOrbit, polarToXY, type NodeRef, type OrbitLayout, type OrbitNode, type RoleArc, type StageSize } from './orbitLayout.ts'
import { initials } from './initials.ts'
import { OrbitMotion, type MotionNode } from './orbitMotion.ts'

// The size a record and a person's disc are drawn at before the motion scales them (the prototype's values).
const baseRadius = { song: 22, person: 12.6, more: 12 } as const
const noRoles: CreditRoleKey[] = []

export interface SceneHandlers {
  /** A node was chosen: it becomes the centre. */
  onChoose: (node: OrbitNode) => void
  /** A node is being looked at (pointer or keyboard focus); x and y are in the stage's coordinates. */
  onHover: (node: OrbitNode, x: number, y: number) => void
  onLeave: () => void
  onMove: (event: MouseEvent) => void
}

interface OrbitSceneProps extends SceneHandlers {
  workspace: Workspace
  centre: NodeRef
  stage: StageSize
  /** The node being looked at, for the focus mode. */
  focusId: string | null
  svgRef: RefObject<SVGSVGElement | null>
}

/**
 * The layers of the orbit: guides, role arcs, links, nodes and labels.
 *
 * React draws what exists and what it looks like; `OrbitMotion` says where it is. A `d3-timer` writes `transform`,
 * `opacity` and a link's `d` straight onto the elements once a frame, so a transition is not a hundred React renders a
 * second, and React never sets those attributes itself, so it never undoes them.
 */
export function OrbitScene({ workspace, centre, stage, focusId, svgRef, onChoose, onHover, onLeave, onMove }: OrbitSceneProps) {
  const reduced = useReducedMotion()
  // The layout depends on which node is the centre, not on the object that names it (a new one on every render).
  const { type: centreType, id: centreId } = centre
  const layout = useMemo(() => layoutOrbit(workspace, { type: centreType, id: centreId }, stage), [workspace, centreType, centreId, stage])

  const elements = useRef(new Map<string, SVGElement>())
  const motionRef = useRef<OrbitMotion | null>(null)
  const layoutRef = useRef<OrbitLayout>(layout)
  const [settledKey, setSettledKey] = useState<string | null>(null)
  const settled = settledKey === layout.key

  // Nodes that have left the layout stay in the page until their exit has played.
  const [scene, setScene] = useState<{ layout: OrbitLayout; leaving: OrbitNode[] }>({ layout, leaving: [] })
  let shown = scene
  if (scene.layout !== layout) {
    // LEARN: LG-03R derived-state | What the previous render knew (the nodes that are leaving) is kept by comparing during render and setting state then: React re-renders at once, before anything is painted, which an effect would not do
    const still = new Set(layout.nodes.map((node) => node.id))
    const leaving = [...scene.layout.nodes, ...scene.leaving].filter((node, index, all) => !still.has(node.id) && all.findIndex((other) => other.id === node.id) === index)
    shown = { layout, leaving }
    setScene(shown)
  }
  const rendered = useMemo(() => [...shown.layout.nodes, ...shown.leaving], [shown.layout, shown.leaving])
  const staying = useMemo(() => new Set(layout.nodes.map((node) => node.id)), [layout])

  const register = useCallback((key: string, element: SVGElement | null) => {
    if (element === null) elements.current.delete(key)
    else elements.current.set(key, element)
  }, [])

  // The frame: every node's place and size, then every link between the nodes that are still in the layout.
  const paint = useCallback((nodes: ReadonlyMap<string, MotionNode>) => {
    const link = linkRadial<{ source: { a: number; r: number }; target: { a: number; r: number } }, { a: number; r: number }>()
      .angle((point) => point.a)
      .radius((point) => point.r)
    const xy = new Map<string, [number, number]>()

    for (const node of nodes.values()) {
      const [x, y] = polarToXY(node.cur.r, node.cur.a)
      xy.set(node.id, [x, y])
      const scale = Math.max(0.001, node.size / baseRadius[node.kind])

      const group = elements.current.get(`n:${node.id}`)
      if (group !== undefined) {
        group.setAttribute('transform', `translate(${x.toFixed(2)},${y.toFixed(2)}) scale(${scale.toFixed(3)})`)
        group.setAttribute('opacity', node.opacity.toFixed(3))
        group.setAttribute('data-big', scale > 1.05 ? '1' : '0')
      }

      const label = elements.current.get(`t:${node.id}`)
      if (label === undefined) continue
      label.setAttribute('opacity', node.opacity.toFixed(3))
      if (node.depth === 2) {
        // Second-ring labels are set along the radius and turned so they never read upside down.
        const degrees = (node.cur.a * 180) / Math.PI
        const right = ((node.cur.a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) < Math.PI
        label.setAttribute('transform', `translate(${x.toFixed(2)},${y.toFixed(2)}) rotate(${(right ? degrees - 90 : degrees + 90).toFixed(2)})`)
        label.setAttribute('x', String(right ? node.size + 6 : -(node.size + 6)))
        label.setAttribute('y', '4')
        label.setAttribute('text-anchor', right ? 'start' : 'end')
      } else {
        label.setAttribute('transform', `translate(${x.toFixed(2)},${y.toFixed(2)})`)
        label.setAttribute('x', '0')
        label.setAttribute('y', String(node.size + 15))
        label.setAttribute('text-anchor', 'middle')
      }
    }

    const current = layoutRef.current
    for (const edge of current.links) {
      const source = nodes.get(edge.source)
      const target = nodes.get(edge.target)
      const path = elements.current.get(`l:${edge.id}`)
      if (source === undefined || target === undefined || path === undefined) continue
      path.setAttribute('d', link({ source: source.cur, target: target.cur }) ?? '')
      path.setAttribute('opacity', (Math.min(source.opacity, target.opacity) * 0.8).toFixed(3))
    }
    for (const edge of current.crossLinks) {
      const source = xy.get(edge.source)
      const target = xy.get(edge.target)
      const path = elements.current.get(`x:${edge.id}`)
      if (source === undefined || target === undefined || path === undefined) continue
      path.setAttribute('d', `M${source[0]},${source[1]} Q${(source[0] + target[0]) * 0.32},${(source[1] + target[1]) * 0.32} ${target[0]},${target[1]}`)
      path.setAttribute('opacity', Math.min(nodes.get(edge.source)?.opacity ?? 1, nodes.get(edge.target)?.opacity ?? 1).toFixed(3))
    }
  }, [])

  // The motion belongs to the elements this component has mounted: made when they are, stopped when they go.
  useLayoutEffect(() => {
    const motion = new OrbitMotion(
      paint,
      (ids) => {
        const gone = new Set(ids)
        setScene((current) => ({ ...current, leaving: current.leaving.filter((node) => !gone.has(node.id)) }))
      },
      () => setSettledKey(layoutRef.current.key),
    )
    motionRef.current = motion
    return () => {
      motion.dispose()
      motionRef.current = null
    }
  }, [paint])

  useLayoutEffect(() => {
    layoutRef.current = layout
    const motion = motionRef.current
    if (motion === null) return
    // The same nodes in a different size is a resize: it snaps. A different set of nodes is a change to be seen.
    const changed = motion.key !== layout.key
    motion.key = layout.key
    motion.retarget(layout, changed && !reduced)
  }, [layout, reduced])

  const related = useMemo(() => {
    if (focusId === null) return null
    const parents = new Map(layout.nodes.map((node) => [node.id, node.parent]))
    const set = new Set<string>([focusId])
    for (let at = parents.get(focusId); at; at = parents.get(at) ?? null) set.add(at)
    for (const node of layout.nodes) if (node.parent === focusId) set.add(node.id)
    for (const edge of layout.crossLinks) {
      if (edge.source === focusId) set.add(edge.target)
      if (edge.target === focusId) set.add(edge.source)
    }
    return set
  }, [focusId, layout])

  const stageRect = useCallback(() => svgRef.current?.getBoundingClientRect(), [svgRef])

  return (
    <>
      <g aria-hidden="true">
        {layout.guides.map((radius) => (
          <circle key={radius} className="guide" r={radius} />
        ))}
      </g>

      {/* The role arcs come in after the nodes have settled: they would be wrong while the nodes are moving. */}
      <g className="arcs" aria-hidden="true" style={{ opacity: settled ? 1 : 0 }}>
        {layout.arcs.map((roleArc) => <RoleArcShape key={roleArc.id} arc={roleArc} />)}
      </g>

      <g aria-hidden="true">
        {layout.crossLinks.map((edge) => (
          <path
            key={edge.id}
            ref={(element) => register(`x:${edge.id}`, element)}
            className={related !== null && edge.source !== focusId && edge.target !== focusId ? 'xlnk dim' : 'xlnk'}
          />
        ))}
      </g>

      <g aria-hidden="true">
        {layout.links.map((edge) => {
          const onPath = related !== null && related.has(edge.source) && related.has(edge.target)
          return (
            <path
              key={edge.id}
              ref={(element) => register(`l:${edge.id}`, element)}
              className={related !== null && !onPath ? 'lnk dim' : 'lnk'}
              style={{ stroke: `var(--role-${edge.role})` }}
            />
          )
        })}
      </g>

      <g>
        {rendered.map((node) => (
          <OrbitNodeShape
            key={node.id}
            node={node}
            roles={node.kind === 'person' ? (workspace.personById.get(node.ref)?.roles ?? noRoles) : noRoles}
            name={nodeName(workspace, node)}
            summary={nodeSummary(workspace, node, centre)}
            connector={node.kind === 'person' && (workspace.personById.get(node.ref)?.songs.length ?? 0) >= 2}
            spinning={node.depth === 0 || workspace.songById.get(node.ref)?.creditsStatus === 'loading'}
            dim={related !== null && !related.has(node.id)}
            leaving={!staying.has(node.id)}
            register={register}
            onChoose={onChoose}
            onHover={onHover}
            onLeave={onLeave}
            onMove={onMove}
            stageRect={stageRect}
          />
        ))}
      </g>

      <g aria-hidden="true">
        {rendered.map((node) => (
          <text
            key={node.id}
            ref={(element) => register(`t:${node.id}`, element)}
            className={`lbl${node.depth === 2 ? ' sm' : ''}${related !== null && !related.has(node.id) ? ' dim' : ''}`}
          >
            {node.label}
          </text>
        ))}
      </g>

      {layout.noCredits && settled && (
        <text className="empty" textAnchor="middle" y={90}>
          No credits on MusicBrainz yet
        </text>
      )}
    </>
  )
}

function nodeName(workspace: Workspace, node: OrbitNode): string {
  if (node.kind === 'song') return workspace.songById.get(node.ref)?.title ?? ''
  if (node.kind === 'person') return workspace.personById.get(node.ref)?.name ?? ''
  return `${node.moreCount} more people`
}

/** What a node says in words besides its name, for its accessible label (colour and position carry no fact alone). */
function nodeSummary(workspace: Workspace, node: OrbitNode, centre: NodeRef): string {
  if (node.kind === 'song') {
    const count = workspace.peopleBySong.get(node.ref)?.length ?? 0
    return count === 0 ? 'no credits yet' : `${count} ${count === 1 ? 'person' : 'people'} credited`
  }
  if (node.kind === 'person') {
    const person = workspace.personById.get(node.ref)
    if (person === undefined) return ''
    const roles = centre.type === 'song' && person.bySong.has(centre.id) ? rolesOnSong(person, centre.id) : person.roles
    const names = roles.map((role) => creditRoleStyles[role].label.toLowerCase())
    const list = names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
    return `credited as ${list} on ${person.songs.length} ${person.songs.length === 1 ? 'song' : 'songs'}`
  }
  return 'opens the text view'
}

interface NodeShapeProps extends SceneHandlers {
  node: OrbitNode
  roles: CreditRoleKey[]
  name: string
  summary: string
  connector: boolean
  spinning: boolean
  dim: boolean
  leaving: boolean
  register: (key: string, element: SVGElement | null) => void
  stageRect: () => DOMRect | undefined
}

/**
 * One node. A song is a record (a black disc with grooves and a label in its sleeve's colours); a person is a disc with
 * their initials, ringed by one segment per role, and a connector (two or more songs) has a ripple. Every node but the
 * centre is a button that makes it the centre.
 */
const OrbitNodeShape = memo(function OrbitNodeShape(props: NodeShapeProps) {
  const { node, roles, name, summary, connector, spinning, dim, leaving, register, onChoose, onHover, onLeave, onMove, stageRect } = props
  const isCentre = node.depth === 0

  const segments = useMemo(() => {
    const slices = pie<CreditRoleKey>().value(1).sort(null).padAngle(roles.length > 1 ? 0.16 : 0)(roles.length > 0 ? roles : ['other'])
    const shape = arc<(typeof slices)[number]>().innerRadius(10).outerRadius(12.8)
    return slices.map((slice) => ({ role: slice.data, d: shape(slice) ?? '' }))
  }, [roles])

  function activate(event: KeyboardEvent) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onChoose(node)
  }

  const label = isCentre
    ? `${name}, the centre of this view`
    : node.kind === 'more'
      ? `Show the ${node.moreCount} more people in the text view`
      : `Put ${name} at the centre; ${summary}`
  const palette = node.kind === 'song' ? sleeveFor(node.ref) : null

  return (
    <g
      ref={(element) => register(`n:${node.id}`, element)}
      className={`nd${isCentre ? ' is-centre' : ''}${spinning ? ' is-spinning' : ''}${dim ? ' dim' : ''}`}
      data-id={node.id}
      // A node that is leaving is about to be gone: it is not a button any more.
      tabIndex={isCentre || leaving ? -1 : 0}
      role={isCentre ? 'img' : 'button'}
      aria-label={label}
      aria-hidden={leaving ? true : undefined}
      onClick={() => !leaving && onChoose(node)}
      onKeyDown={activate}
      onMouseEnter={(event) => {
        const stage = stageRect()
        if (!leaving && stage !== undefined) onHover(node, event.clientX - stage.left + 14, event.clientY - stage.top + 14)
      }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      onFocus={(event) => {
        const stage = stageRect()
        if (leaving || stage === undefined) return
        const rect = event.currentTarget.getBoundingClientRect()
        onHover(node, rect.right - stage.left + 8, rect.top - stage.top)
      }}
      onBlur={onLeave}
    >
      {node.kind === 'song' && palette !== null && (
        <>
          <circle className="hit" r={22} style={{ fill: "var(--vinyl)" }} stroke="#ffffff30" />
          <g className="spin">
            {[20.4, 18.3, 16.2, 14.1].map((r) => (
              <circle key={r} r={r} fill="none" stroke="#fff" strokeOpacity={0.08} />
            ))}
            <circle r={10.6} fill={palette.background} />
            <circle cx={0} cy={-6.4} r={2.6} fill={palette.mark} />
          </g>
          <circle r={1.6} style={{ fill: "var(--vinyl)" }} />
        </>
      )}

      {node.kind === 'person' && (
        <>
          {connector && <circle className="ripple" r={13} style={{ stroke: `var(--role-${roles[0] ?? 'other'})` }} />}
          <circle className="hit" r={10} style={{ fill: "var(--raised)" }} />
          {segments.map((segment) => (
            <path key={segment.role} d={segment.d} style={{ fill: `var(--role-${segment.role})` }} />
          ))}
          <text className="ini" textAnchor="middle" dy=".36em">
            {initials(name)}
          </text>
        </>
      )}

      {node.kind === 'more' && (
        <>
          <circle className="hit" r={11} style={{ fill: "var(--raised)", stroke: "var(--line-strong)" }} />
          <text className="ini" textAnchor="middle" dy=".36em">
            …
          </text>
        </>
      )}
    </g>
  )
})

function arcPath(radius: number, a0: number, a1: number, flip: boolean): string {
  const [x0, y0] = polarToXY(radius, a0)
  const [x1, y1] = polarToXY(radius, a1)
  const large = a1 - a0 > Math.PI ? 1 : 0
  return flip ? `M${x1},${y1} A${radius},${radius} 0 ${large} 0 ${x0},${y0}` : `M${x0},${y0} A${radius},${radius} 0 ${large} 1 ${x1},${y1}`
}

/** One role's arc inside the first ring, with the role's name set along it when it fits. */
function RoleArcShape({ arc: roleArc }: { arc: RoleArc }) {
  const id = useId()
  const color = `var(--role-${roleArc.role})`

  return (
    <>
      <path className="roleArc" style={{ stroke: color }} d={arcPath(roleArc.radius, roleArc.a0, roleArc.a1, false)} />
      {roleArc.label !== null && (
        <>
          <path id={id} fill="none" d={arcPath(roleArc.flip ? roleArc.radius - 6 : roleArc.radius - 12, roleArc.a0, roleArc.a1, roleArc.flip)} />
          <text className="roleTxt" style={{ fill: color }}>
            <textPath href={`#${id}`} startOffset="50%" textAnchor="middle">
              {roleArc.label}
            </textPath>
          </text>
        </>
      )}
    </>
  )
}
