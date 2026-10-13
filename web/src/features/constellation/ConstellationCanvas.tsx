import { useColorScheme } from '@mui/material/styles'
import { select } from 'd3-selection'
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom'
import { useEffect, useMemo, useRef } from 'react'
import { creditRoles, creditRoleStyles, type CreditRoleKey } from '../../app/creditRoles.ts'
import { tokens } from '../../app/tokens.ts'
import { drawGraph, ENTER_MS, type Palette, type Transform } from '../graph/drawGraph.ts'
import type { GraphNode } from '../graph/graphModel.ts'
import { createHitTester, type HitTester } from '../graph/hitTest.ts'
import { useReducedMotion } from '../../motion/useReducedMotion.ts'
import { fitMargins, type Constellation } from './constellationModel.ts'
import type { ConstellationHandlers } from './ConstellationSvg.tsx'
import type { LayoutController } from './LayoutController.ts'

function paletteFor(scheme: 'dark' | 'light'): Palette {
  const roles = Object.fromEntries(creditRoles.map((role) => [role, creditRoleStyles[role].colors[scheme]])) as Record<CreditRoleKey, string>
  const token = tokens[scheme]
  return {
    background: token.panel,
    text: token.fg,
    link: token.lineStrong,
    song: token.vinyl,
    // The accent in the dark scheme, its deepened value on the light surface (3:1, NFR-A11Y-02).
    selected: creditRoleStyles.producer.colors[scheme],
    roles,
  }
}

interface ConstellationCanvasProps extends ConstellationHandlers {
  graph: Constellation
  controller: LayoutController
  focusId: string | null
}

/**
 * The constellation on a canvas (FR-VIEW-02, NFR-PERF-03): used above the node threshold, where SVG elements, each
 * with a transform written on every tick, stop being cheap. It is the M3 canvas renderer, re-styled to the tokens: the
 * same `drawGraph`, a quadtree hit test, `d3-zoom` for the view, and the same layout controller the SVG renderer uses.
 * Nodes are not individually focusable here; the connector cards, the liner notes, the find box and the Text view
 * reach everything.
 */
export function ConstellationCanvas({ graph, controller, focusId, onChoose, onHover, onMove }: ConstellationCanvasProps) {
  const { colorScheme } = useColorScheme()
  const scheme = colorScheme === 'light' ? 'light' : 'dark'
  const palette = useMemo(() => paletteFor(scheme), [scheme])
  const reduced = useReducedMotion()

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const frame = useRef({
    width: 0,
    height: 0,
    dpr: 1,
    transform: { x: 0, y: 0, k: 1 },
    nodes: new Map<string, GraphNode>(),
    graph,
    hoveredId: null as string | null,
    focusIds: null as ReadonlySet<string> | null,
    born: new Map<string, number>(),
    palette,
    userMoved: false,
    hit: null as HitTester | null,
    redraw: (): void => undefined,
    fit: (): void => undefined,
  })
  const handlers = useRef({ onChoose, onHover, onMove })
  const zoomRef = useRef<ZoomBehavior<HTMLCanvasElement, unknown> | null>(null)

  // What the pointer handlers and the draw loop read is kept in a ref, so changing it never rebuilds the canvas.
  useEffect(() => {
    handlers.current = { onChoose, onHover, onMove }
  }, [onChoose, onHover, onMove])

  useEffect(() => {
    const state = frame.current
    state.palette = palette
    state.hoveredId = focusId
    state.focusIds = focusId === null ? null : (graph.neighbours.get(focusId) ?? null)
    state.redraw()
  }, [palette, focusId, graph])

  // The canvas, its size, the zoom and the pointer: set up once.
  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return
    const state = frame.current
    const context = canvas.getContext('2d')
    if (context === null) return // no 2D canvas (a test environment): the Text view still has everything

    let scheduled = false
    function draw() {
      scheduled = false
      if (context === null) return
      const animating = drawGraph(context, {
        width: state.width,
        height: state.height,
        dpr: state.dpr,
        transform: state.transform,
        nodes: [...state.nodes.values()],
        links: state.graph.links,
        hoveredId: state.hoveredId,
        selectedId: null,
        focusIds: state.focusIds,
        born: state.born,
        now: performance.now(),
        palette: state.palette,
        personCount: state.graph.personCount,
      })
      // The loop runs only while something moves or fades: a graph at rest costs no frames.
      if (animating) schedule()
    }
    function schedule() {
      if (scheduled) return
      scheduled = true
      requestAnimationFrame(draw)
    }
    state.redraw = schedule

    function resize() {
      const box = canvas!.getBoundingClientRect()
      state.width = box.width
      state.height = box.height
      state.dpr = window.devicePixelRatio || 1
      canvas!.width = Math.max(1, Math.round(box.width * state.dpr))
      canvas!.height = Math.max(1, Math.round(box.height * state.dpr))
      if (!state.userMoved) state.fit()
      schedule()
    }

    function pointToGraph(clientX: number, clientY: number) {
      const box = canvas!.getBoundingClientRect()
      const { x, y, k } = state.transform
      return { gx: (clientX - box.left - x) / k, gy: (clientY - box.top - y) / k, k }
    }
    const hitAt = (clientX: number, clientY: number) => {
      const { gx, gy, k } = pointToGraph(clientX, clientY)
      return state.hit?.find(gx, gy, k) ?? null
    }

    // Zoom and pan. d3-zoom turns wheel, drag and pinch into one transform; a press on a node is the node's, not a pan.
    const behaviour = d3zoom<HTMLCanvasElement, unknown>()
      .filter((event: Event) => {
        if (event.type === 'wheel') return true
        const pointer = event as globalThis.MouseEvent & { touches?: TouchList }
        if (pointer.button || pointer.ctrlKey) return false
        const point = pointer.touches?.[0] ?? pointer
        return hitAt(point.clientX, point.clientY) === null
      })
      .scaleExtent([0.2, 3])
      .on('zoom', (event: { transform: Transform; sourceEvent: Event | null }) => {
        state.transform = { x: event.transform.x, y: event.transform.y, k: event.transform.k }
        if (event.sourceEvent !== null && event.sourceEvent !== undefined) state.userMoved = true
        schedule()
      })
    zoomRef.current = behaviour
    select(canvas).call(behaviour).on('dblclick.zoom', null)

    state.fit = () => {
      const nodes = [...state.nodes.values()]
      if (nodes.length === 0 || state.width === 0) {
        behaviour.transform(select(canvas), zoomIdentity.translate(state.width / 2, state.height / 2))
        return
      }
      const xs = nodes.map((node) => node.x ?? 0)
      const ys = nodes.map((node) => node.y ?? 0)
      const margin = fitMargins(state.width)
      const w = Math.max(...xs) - Math.min(...xs) + 190
      const h = Math.max(...ys) - Math.min(...ys) + 110
      const room = Math.max(60, state.height - margin.top - margin.bottom)
      const k = Math.min(2, Math.max(0.2, Math.min(state.width / w, room / h)))
      const cx = (Math.max(...xs) + Math.min(...xs)) / 2
      const cy = (Math.max(...ys) + Math.min(...ys)) / 2
      behaviour.transform(select(canvas), zoomIdentity.translate(state.width / 2 - cx * k, margin.top + room / 2 - cy * k).scale(k))
    }

    // Dragging a node and choosing one share the pointer: a press that moves is a drag, one that does not is a click.
    let dragging: { id: string; startX: number; startY: number; moved: boolean } | null = null
    function onDown(event: PointerEvent) {
      if (event.button !== 0) return
      const hit = hitAt(event.clientX, event.clientY)
      if (hit === null) return
      dragging = { id: hit.id, startX: event.clientX, startY: event.clientY, moved: false }
      canvas!.setPointerCapture(event.pointerId)
    }
    function onPointerMove(event: PointerEvent) {
      if (dragging !== null) {
        if (!dragging.moved && Math.hypot(event.clientX - dragging.startX, event.clientY - dragging.startY) < 4) return
        dragging.moved = true
        const { gx, gy } = pointToGraph(event.clientX, event.clientY)
        controller.pin(dragging.id, gx, gy)
        return
      }
      const hit = hitAt(event.clientX, event.clientY)
      const id = hit?.id ?? null
      if (id !== state.hoveredId) {
        canvas!.style.cursor = hit === null ? 'grab' : 'pointer'
        const box = canvas!.getBoundingClientRect()
        handlers.current.onHover(hit === null ? null : (state.graph.nodes.find((node) => node.id === id) ?? null), event.clientX - box.left + 14, event.clientY - box.top + 14)
      }
      handlers.current.onMove(event as unknown as React.MouseEvent)
    }
    function onUp(event: PointerEvent) {
      if (dragging === null) return
      const finished = dragging
      dragging = null
      canvas!.releasePointerCapture(event.pointerId)
      if (finished.moved) {
        controller.release(finished.id)
        return
      }
      const node = state.graph.nodes.find((candidate) => candidate.id === finished.id)
      if (node !== undefined) handlers.current.onChoose(node)
    }
    function onLeave() {
      if (dragging === null && state.hoveredId !== null) handlers.current.onHover(null, 0, 0)
    }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointerleave', onLeave)
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()

    return () => {
      observer.disconnect()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointerleave', onLeave)
      select(canvas).on('.zoom', null)
      state.redraw = () => undefined
      state.fit = () => undefined
    }
  }, [controller])

  // The layout's positions are written onto the nodes the canvas draws.
  useEffect(() => {
    const state = frame.current
    const apply = () => {
      for (const node of state.nodes.values()) {
        const position = controller.positions.get(node.id)
        if (position !== undefined) {
          node.x = position.x
          node.y = position.y
        }
      }
      state.hit = createHitTester([...state.nodes.values()])
      state.redraw()
    }
    const stopTicks = controller.subscribe(apply)
    const stopSettled = controller.onSettled(() => {
      apply()
      if (!state.userMoved) state.fit()
    })
    return () => {
      stopTicks()
      stopSettled()
    }
  }, [controller])

  // The graph changed: merge it into the nodes the canvas holds (keeping positions), note which are new for the
  // fade-in, and give the layout the graph.
  useEffect(() => {
    const state = frame.current
    const now = performance.now()
    const next = new Map<string, GraphNode>()
    for (const node of graph.nodes) {
      const existing = state.nodes.get(node.id)
      if (existing === undefined) {
        next.set(node.id, { ...node })
        if (!reduced && state.nodes.size > 0) state.born.set(node.id, now)
      } else {
        // Keep the object (and so its position); take the fields that may have changed.
        next.set(node.id, Object.assign(existing, node, { x: existing.x, y: existing.y }))
      }
    }
    for (const id of state.born.keys()) {
      if (!next.has(id) || now - state.born.get(id)! > ENTER_MS) state.born.delete(id)
    }
    state.nodes = next
    state.graph = graph
    controller.setReducedMotion(reduced)
    controller.update(graph)
    for (const node of next.values()) {
      const position = controller.positions.get(node.id)
      if (position !== undefined) {
        node.x = position.x
        node.y = position.y
      }
    }
    state.hit = createHitTester([...next.values()])
    state.redraw()
  }, [graph, controller, reduced])

  return (
    <canvas
      ref={canvasRef}
      // role="img" gives the canvas a name; its content is not readable by assistive technology, which is why the
      // Text view carries the same data (NFR-A11Y-01).
      role="img"
      aria-label={`Credits graph, the whole graph as a constellation of ${graph.songCount} ${graph.songCount === 1 ? 'song' : 'songs'} and ${graph.personCount} ${graph.personCount === 1 ? 'person' : 'people'}. The Text view has the same information.`}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', touchAction: 'none', cursor: 'grab' }}
    />
  )
}
