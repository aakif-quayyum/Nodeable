import { linkRadial } from 'd3-shape'
import {
  memo,
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
} from 'react'
import { creditRoleStyles, type CreditRoleKey } from '../../app/creditRoles.ts'
import { useReducedMotion } from '../../motion/useReducedMotion.ts'
import { rolesOnSong, type Workspace } from '../graph/workspaceModel.ts'
import { polarToXY, type NodeRef, type OrbitLayout, type OrbitNode, type RoleArc } from './orbitLayout.ts'
import { PersonGlyph, recordRadius, personRadius, RecordGlyph } from './NodeGlyphs.tsx'
import { OrbitMotion, type MotionNode } from './orbitMotion.ts'
import { usePlayingSong } from '../preview/previewPlayback.ts'

// The size a record and a person's disc are drawn at before the motion scales them (the prototype's values).
const baseRadius = { graph: 22, song: recordRadius, person: personRadius, more: 12 } as const
const noRoles: CreditRoleKey[] = []

export interface SceneHandlers {
  /** A node was chosen: it becomes the centre. */
  onChoose: (node: OrbitNode) => void
  /** Enter on a focused person: their drawer opens (FR-PERSON-01, D2). */
  onDetails: (personMbid: string) => void
  /** A node is being looked at (pointer or keyboard focus); x and y are in the stage's coordinates. */
  onHover: (node: OrbitNode, x: number, y: number) => void
  onLeave: () => void
  onMove: (event: MouseEvent) => void
}

interface OrbitSceneProps extends SceneHandlers {
  workspace: Workspace
  centre: NodeRef
  /** The tree fitted to the stage (`layoutOrbit`); the view makes it, because it also needs the layout's origin. */
  layout: OrbitLayout
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
// LEARN: LG-03R react-structure-d3-motion | React decides which elements exist and what they look like; the motion engine writes transform and opacity onto those elements through refs, and React never sets those two attributes in JSX, so a re-render cannot undo a frame of the animation
export function OrbitScene({ workspace, centre, layout, focusId, svgRef, onChoose, onDetails, onHover, onLeave, onMove }: OrbitSceneProps) {
  // Changes only when playing starts or stops, so the orbit is not drawn again as the playhead moves.
  const playingSong = usePlayingSong()
  const reduced = useReducedMotion()

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
      // Where the name sits against its node was decided by the layout (`data-place`); the line offsets are in the
      // spans, so a frame only moves the one text element.
      const at = `translate(${x.toFixed(2)},${y.toFixed(2)})`
      switch (label.dataset.place) {
        case 'radial': {
          // Second-ring names are set along the radius and turned so they never read upside down.
          const degrees = (node.cur.a * 180) / Math.PI
          const right = ((node.cur.a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) < Math.PI
          const along = right ? node.size + 6 : -(node.size + 6)
          label.setAttribute('transform', `${at} rotate(${(right ? degrees - 90 : degrees + 90).toFixed(2)}) translate(${along.toFixed(2)},0)`)
          label.setAttribute('text-anchor', right ? 'start' : 'end')
          break
        }
        case 'start':
          label.setAttribute('transform', `translate(${(x + node.size + 6).toFixed(2)},${y.toFixed(2)})`)
          label.setAttribute('text-anchor', 'start')
          break
        case 'end':
          label.setAttribute('transform', `translate(${(x - node.size - 6).toFixed(2)},${y.toFixed(2)})`)
          label.setAttribute('text-anchor', 'end')
          break
        case 'above':
          label.setAttribute('transform', `translate(${x.toFixed(2)},${(y - node.size - 8).toFixed(2)})`)
          label.setAttribute('text-anchor', 'middle')
          break
        default:
          label.setAttribute('transform', `translate(${x.toFixed(2)},${(y + node.size + 15).toFixed(2)})`)
          label.setAttribute('text-anchor', 'middle')
          break
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
              style={{ stroke: edge.role === 'plain' ? 'var(--line-strong)' : `var(--role-${edge.role})` }}
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
            songCount={workspace.songs.length}
            artRelease={node.kind === 'song' ? workspace.songById.get(node.ref)?.artReleaseMbid : undefined}
            artGroup={node.kind === 'song' ? workspace.songById.get(node.ref)?.artReleaseGroupMbid : undefined}
            artDeezer={node.kind === 'song' ? workspace.songById.get(node.ref)?.deezerCoverMd5 : undefined}
            onDetails={onDetails}
            spinning={
              (node.depth === 0 && node.kind !== 'graph') ||
              workspace.songById.get(node.ref)?.creditsStatus === 'loading' ||
              // The record of the song whose preview is playing turns while it plays (FR-WAVE-01); the CSS stills it with reduced motion.
              (node.kind === 'song' && node.ref === playingSong)
            }
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

      {/* The names are never smaller than 12 px; on a large stage they grow with the nodes (`fontScale`). */}
      <g aria-hidden="true" style={{ '--ls': layout.fontScale } as CSSProperties}>
        {rendered.map((node) => {
          // The node that is hovered or focused shows its whole name, on one line, whatever the room was for the rest.
          const lines = node.id === focusId && node.kind !== 'more' ? [nodeName(workspace, node)] : node.lines
          return (
            <text
              key={node.id}
              ref={(element) => register(`t:${node.id}`, element)}
              data-place={node.place}
              className={`lbl${node.depth === 2 ? ' sm' : ''}${related !== null && !related.has(node.id) ? ' dim' : ''}`}
            >
              {lines.map((line, index) => (
                <tspan key={index} x={0} dy={lineOffset(node.place, lines.length, index)}>
                  {line}
                </tspan>
              ))}
            </text>
          )
        })}
      </g>
    </>
  )
}

/** The `dy` of a name's line: the first one is lifted so that a block of lines is centred on, or ends above, its node. */
function lineOffset(place: OrbitNode['place'], count: number, index: number): string {
  if (index > 0) return '1.15em'
  if (place === 'above') return `${(-(count - 1) * 1.15).toFixed(3)}em`
  if (place === 'below') return '0'
  return `${(0.35 - (count - 1) * 0.575).toFixed(3)}em`
}

function nodeName(workspace: Workspace, node: OrbitNode): string {
  if (node.kind === 'graph') return 'Your graph'
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
  /** The number of songs in the graph, which the graph's own hub names. */
  songCount: number
  /** The ids a song's cover is looked up by, for the record's label. */
  artRelease: string | null | undefined
  artGroup: string | null | undefined
  artDeezer: string | null | undefined
  /** Enter on a focused person (FR-PERSON-01). */
  onDetails: (personMbid: string) => void
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
  const { node, roles, name, summary, connector, songCount, artRelease, artGroup, artDeezer, onDetails, spinning, dim, leaving, register, onChoose, onHover, onLeave, onMove, stageRect } = props
  const isCentre = node.depth === 0

  // D2 (2026-10-14): a click, and the space bar like a button's, put the person at the centre; Enter opens their details.
  function activate(event: KeyboardEvent) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    if (event.key === 'Enter' && node.kind === 'person' && !isCentre && !leaving) {
      onDetails(node.ref)
      return
    }
    onChoose(node)
  }

  const label = isCentre
    ? node.kind === 'graph'
      ? `Your graph, ${songCount} ${songCount === 1 ? 'song' : 'songs'}, the centre of this view`
      : `${name}, the centre of this view`
    : node.kind === 'more'
      ? `Show the ${node.moreCount} more people in the text view`
      : `Put ${name} at the centre; ${summary}`

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
      {/* The press area (WCAG 2.2, 2.5.8): at least 24 px across, and not overlapping the next node's; the drawn disc is
          smaller. Drawn in the glyph's units, so the group's scale gives it its size on the stage. */}
      {!isCentre && <circle className="hita" r={(baseRadius[node.kind] * node.hit) / Math.max(node.size, 1)} fill="transparent" />}

      {node.kind === 'song' && <RecordGlyph mbid={node.ref} artRelease={artRelease} artGroup={artGroup} artDeezer={artDeezer} />}

      {node.kind === 'graph' && (
        <>
          <circle className="hit" r={22} style={{ fill: 'var(--raised)', stroke: 'var(--line-strong)' }} />
          <circle r={18.5} fill="none" stroke="var(--line-strong)" strokeDasharray="1 3" />
          <text className="hubN" textAnchor="middle" y={2}>
            {songCount}
          </text>
          <text className="hubL" textAnchor="middle" y={11}>
            {songCount === 1 ? 'song' : 'songs'}
          </text>
        </>
      )}

      {node.kind === 'person' && <PersonGlyph name={name} roles={roles} connector={connector} />}

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
          <path id={id} fill="none" d={arcPath(roleArc.flip ? roleArc.radius - 6 : roleArc.radius - 13, roleArc.a0, roleArc.a1, roleArc.flip)} />
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
