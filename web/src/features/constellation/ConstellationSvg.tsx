import { drag as d3drag, type D3DragEvent } from 'd3-drag'
import { select } from 'd3-selection'
import { zoom as d3zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior } from 'd3-zoom'
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { creditRoleStyles } from '../../app/creditRoles.ts'
import { useReducedMotion } from '../../motion/useReducedMotion.ts'
import type { GraphNode } from '../graph/graphModel.ts'
import { PersonGlyph, personRadius, RecordGlyph, recordRadius } from '../orbit/NodeGlyphs.tsx'
import { OrbitSvg } from '../orbit/orbitStyles.ts'
import { fitName } from '../orbit/labelFit.ts'
import { fitMargins, type Constellation } from './constellationModel.ts'
import type { LayoutController } from './LayoutController.ts'

// jsdom has no layout and no ResizeObserver; a test gets this size.
const fallbackStage = { width: 800, height: 600 }

export interface ConstellationHandlers {
  /** A node was chosen: the orbit opens on it (FR-VIEW-02). */
  onChoose: (node: GraphNode) => void
  /** A node is being looked at (pointer or keyboard focus), or none is (`null`); x and y are in the stage's coordinates. */
  onHover: (node: GraphNode | null, x: number, y: number) => void
  onMove: (event: MouseEvent) => void
}

interface ConstellationSvgProps extends ConstellationHandlers {
  graph: Constellation
  controller: LayoutController
  /** The node being looked at: it and its neighbours stay lit, the rest steps back. */
  focusId: string | null
}

const nameOf = (node: GraphNode) => (node.kind === 'song' ? node.title : node.name)

/** What a node says in words besides its name, for its accessible label. */
function summaryOf(node: GraphNode): string {
  if (node.kind === 'song') return node.artist
  const roles = node.roles.map((role) => creditRoleStyles[role].label.toLowerCase())
  return `on ${node.songs} ${node.songs === 1 ? 'song' : 'songs'}${roles.length > 0 ? `, ${roles.join(', ')}` : ''}`
}

/**
 * The constellation as SVG elements (FR-VIEW-02), used while the graph is small enough that every node can be a
 * focusable button: records and people from the same glyphs the orbit draws, links coloured by role, names for songs
 * and connectors (others while one of their neighbours is looked at), drag to move, wheel and pinch to zoom.
 *
 * As in the orbit, React decides which elements exist and what they look like; the layout's positions are written onto
 * them by a function that runs on every tick, so a moving graph is not a stream of renders.
 */
export function ConstellationSvg({ graph, controller, focusId, onChoose, onHover, onMove }: ConstellationSvgProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const worldRef = useRef<SVGGElement>(null)
  const elements = useRef(new Map<string, SVGElement>())
  const graphRef = useRef(graph)
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const moved = useRef(false)
  const fitRef = useRef<() => void>(() => undefined)

  const reduced = useReducedMotion()
  const [stage, setStage] = useState(typeof ResizeObserver === 'undefined' ? fallbackStage : { width: 0, height: 0 })

  const register = useCallback((key: string, element: SVGElement | null) => {
    if (element === null) elements.current.delete(key)
    else elements.current.set(key, element)
  }, [])

  // Writes where every node is: each node's group and its name, then the line of each link.
  const paint = useCallback(() => {
    const current = graphRef.current
    const byId = new Map(current.nodes.map((node) => [node.id, node]))
    for (const [id, position] of controller.positions) {
      const node = byId.get(id)
      if (node === undefined) continue
      const base = node.kind === 'song' ? recordRadius : personRadius
      elements.current
        .get(`n:${id}`)
        ?.setAttribute('transform', `translate(${position.x.toFixed(1)},${position.y.toFixed(1)}) scale(${(node.r / base).toFixed(3)})`)
      elements.current
        .get(`t:${id}`)
        ?.setAttribute('transform', `translate(${position.x.toFixed(1)},${(position.y + node.r + 3).toFixed(1)})`)
    }
    for (const link of current.links) {
      const from = controller.positions.get(link.source)
      const to = controller.positions.get(link.target)
      const line = elements.current.get(`l:${link.id}`)
      if (from === undefined || to === undefined || line === undefined) continue
      line.setAttribute('x1', from.x.toFixed(1))
      line.setAttribute('y1', from.y.toFixed(1))
      line.setAttribute('x2', to.x.toFixed(1))
      line.setAttribute('y2', to.y.toFixed(1))
    }
  }, [controller])

  useLayoutEffect(() => {
    graphRef.current = graph
    // With reduced motion the layout is worked out to rest before it is first drawn: nothing moves on screen.
    controller.setReducedMotion(reduced)
    controller.update(graph)
    paint()
    if (!moved.current) fitRef.current()
  }, [graph, controller, paint, reduced])

  useLayoutEffect(() => {
    const stopTicks = controller.subscribe(paint)
    const stopSettled = controller.onSettled(() => {
      paint()
      if (!moved.current) fitRef.current()
    })
    return () => {
      stopTicks()
      stopSettled()
    }
  }, [controller, paint])

  // The stage's size, for fitting the picture to it.
  useLayoutEffect(() => {
    const svg = svgRef.current
    if (svg === null || typeof ResizeObserver === 'undefined') return
    let timer: ReturnType<typeof setTimeout> | undefined
    const measure = () => {
      const { width, height } = svg.getBoundingClientRect()
      if (width < 10 || height < 10) return
      setStage((current) => (Math.abs(current.width - width) < 2 && Math.abs(current.height - height) < 2 ? current : { width, height }))
    }
    measure()
    const observer = new ResizeObserver(() => {
      clearTimeout(timer)
      timer = setTimeout(measure, 120)
    })
    observer.observe(svg)
    return () => {
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [])

  // Pan and zoom: d3-zoom moves the world group directly. A press that starts on a node is the node's (a click or a
  // drag), never a pan; the wheel zooms anywhere.
  useLayoutEffect(() => {
    const svg = svgRef.current
    const world = worldRef.current
    if (svg === null || world === null) return
    const behaviour = d3zoom<SVGSVGElement, unknown>()
      .extent(() => {
        const { width, height } = svg.getBoundingClientRect()
        return [
          [0, 0],
          [width || fallbackStage.width, height || fallbackStage.height],
        ]
      })
      .filter((event: Event) => {
        if (event.type === 'wheel') return true
        const pointer = event as globalThis.MouseEvent
        if (pointer.button || pointer.ctrlKey) return false
        return !(event.target instanceof Element && event.target.closest('.nd') !== null)
      })
      .scaleExtent([0.2, 3])
      .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        world.setAttribute('transform', event.transform.toString())
        // Names are drawn at 12 px on the screen whatever the zoom: the labels' size is divided by it (see `--ls`).
        svg.style.setProperty('--zk', event.transform.k.toFixed(3))
        if (event.sourceEvent !== null && event.sourceEvent !== undefined) moved.current = true
      })
    zoomRef.current = behaviour
    select(svg).call(behaviour).on('dblclick.zoom', null)

    // Where the whole picture fits the stage: the bounding box of the positions, with room for the names.
    fitRef.current = () => {
      const rect = svg.getBoundingClientRect()
      const width = rect.width || fallbackStage.width
      const height = rect.height || fallbackStage.height
      const points = [...controller.positions.values()]
      if (points.length === 0) {
        behaviour.transform(select(svg), zoomIdentity.translate(width / 2, height / 2))
        return
      }
      const xs = points.map((point) => point.x)
      const ys = points.map((point) => point.y)
      const margin = fitMargins(width)
      const w = Math.max(...xs) - Math.min(...xs) + 190
      const h = Math.max(...ys) - Math.min(...ys) + 110
      const room = Math.max(60, height - margin.top - margin.bottom)
      const k = Math.min(2, Math.max(0.2, Math.min(width / w, room / h)))
      const cx = (Math.max(...xs) + Math.min(...xs)) / 2
      const cy = (Math.max(...ys) + Math.min(...ys)) / 2
      behaviour.transform(select(svg), zoomIdentity.translate(width / 2 - cx * k, margin.top + room / 2 - cy * k).scale(k))
    }
    fitRef.current()

    return () => {
      select(svg).on('.zoom', null)
      zoomRef.current = null
      fitRef.current = () => undefined
    }
  }, [controller])

  // The picture is fitted again when the stage is resized, until the person has moved it themselves.
  const stageWidth = stage.width
  const stageHeight = stage.height
  useLayoutEffect(() => {
    if (!moved.current) fitRef.current()
  }, [stageWidth, stageHeight])

  // Dragging a node: it is held where the pointer is while the rest of the graph follows it, and let go on release.
  const nodeKey = useMemo(() => graph.nodes.map((node) => node.id).join('|'), [graph.nodes])
  useLayoutEffect(() => {
    const world = worldRef.current
    if (world === null) return
    const behaviour = d3drag<SVGGElement, unknown>()
      // A real pointer always has a view; a synthetic one (jsdom's) has none, and d3-drag cannot start without it.
      .filter((event: Event) => (event as globalThis.MouseEvent).view != null && !(event as globalThis.MouseEvent).button)
      // A press that moves a few pixels is still a click (so a hand that is not quite still can choose a node).
      .clickDistance(4)
      .on('start drag', function (this: SVGGElement, event: D3DragEvent<SVGGElement, unknown, unknown>) {
        const id = this.dataset.id
        if (id !== undefined) controller.pin(id, event.x, event.y)
      })
      .on('end', function (this: SVGGElement) {
        const id = this.dataset.id
        if (id !== undefined) controller.release(id)
      })
    select(world).selectAll<SVGGElement, unknown>('.nd').call(behaviour)
    return () => {
      select(world).selectAll('.nd').on('.drag', null)
    }
  }, [controller, nodeKey])

  const lit = focusId === null ? null : (graph.neighbours.get(focusId) ?? null)

  const stageRect = useCallback(() => svgRef.current?.getBoundingClientRect(), [])

  return (
    <OrbitSvg
      ref={svgRef}
      role="group"
      aria-label={`Credits graph, the whole graph as a constellation of ${graph.songCount} ${graph.songCount === 1 ? 'song' : 'songs'} and ${graph.personCount} ${graph.personCount === 1 ? 'person' : 'people'}`}
    >
      <g ref={worldRef}>
        <g aria-hidden="true">
          {graph.links.map((link) => {
            const dim = lit !== null && !(link.source === focusId || link.target === focusId)
            return (
              <line
                key={link.id}
                ref={(element) => register(`l:${link.id}`, element)}
                style={{
                  stroke: `var(--role-${link.roles[0] ?? 'other'})`,
                  strokeWidth: 1.2,
                  strokeOpacity: dim ? 0.06 : 0.55,
                  transition: 'stroke-opacity 150ms',
                }}
              />
            )
          })}
        </g>

        <g>
          {graph.nodes.map((node) => (
            <ConstellationNode
              key={node.id}
              node={node}
              dim={lit !== null && !lit.has(node.id)}
              register={register}
              stageRect={stageRect}
              onChoose={onChoose}
              onHover={onHover}
              onMove={onMove}
            />
          ))}
        </g>

        <g aria-hidden="true" style={{ '--ls': 'calc(1 / var(--zk, 1))' } as React.CSSProperties}>
          {graph.nodes.map((node) => {
            // Songs are always named; connectors too once the picture is large enough for their names not to run
            // into each other (a zoom of one half or more); anyone else while one of their neighbours is looked at.
            const dim = lit !== null && !lit.has(node.id)
            let opacity: number | string = 0
            if (lit !== null) opacity = lit.has(node.id) ? 1 : 0
            else if (node.kind === 'song') opacity = 1
            else if (node.isHub) opacity = 'clamp(0, calc((var(--zk, 1) - 0.5) * 40), 1)'
            const lines = node.id === focusId ? [nameOf(node)] : fitName(nameOf(node), 26, true)
            return (
              <text
                key={node.id}
                ref={(element) => register(`t:${node.id}`, element)}
                className={`lbl${node.kind === 'person' && !node.isHub ? ' sm' : ''}`}
                textAnchor="middle"
                style={{ opacity: dim ? 0 : opacity, transition: 'opacity 150ms' }}
              >
                {lines.map((line, index) => (
                  <tspan key={index} x={0} dy={index === 0 ? '1em' : '1.15em'}>
                    {line}
                  </tspan>
                ))}
              </text>
            )
          })}
        </g>
      </g>
    </OrbitSvg>
  )
}

interface NodeProps extends ConstellationHandlers {
  node: GraphNode
  dim: boolean
  register: (key: string, element: SVGElement | null) => void
  stageRect: () => DOMRect | undefined
}

const ConstellationNode = memo(function ConstellationNode({ node, dim, register, stageRect, onChoose, onHover, onMove }: NodeProps) {
  const name = nameOf(node)

  function activate(event: KeyboardEvent) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onChoose(node)
  }

  return (
    <g
      ref={(element) => register(`n:${node.id}`, element)}
      className={`nd${dim ? ' dim' : ''}${node.kind === 'person' && node.isHub ? '' : ''}`}
      data-id={node.id}
      data-big={node.r >= 9 ? '1' : '0'}
      tabIndex={0}
      role="button"
      aria-label={`Open ${name} in the orbit; ${summaryOf(node)}`}
      onClick={() => onChoose(node)}
      onKeyDown={activate}
      onMouseEnter={(event) => {
        const stage = stageRect()
        if (stage !== undefined) onHover(node, event.clientX - stage.left + 14, event.clientY - stage.top + 14)
      }}
      onMouseMove={onMove}
      onMouseLeave={() => onHover(null, 0, 0)}
      onFocus={(event) => {
        const stage = stageRect()
        if (stage === undefined) return
        const rect = event.currentTarget.getBoundingClientRect()
        onHover(node, rect.right - stage.left + 8, rect.top - stage.top)
      }}
      onBlur={() => onHover(null, 0, 0)}
    >
      {node.kind === 'song' ? (
        <RecordGlyph mbid={node.mbid} artRelease={node.artRelease} artGroup={node.artGroup} />
      ) : (
        <PersonGlyph name={node.name} roles={node.roles} connector={node.isHub} />
      )}
    </g>
  )
})
