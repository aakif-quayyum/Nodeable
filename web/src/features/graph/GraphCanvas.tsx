import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { useColorScheme } from '@mui/material/styles'
import { select } from 'd3-selection'
import { zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom'
import { useEffect, useMemo, useRef } from 'react'
import { creditRoles, creditRoleStyles, type CreditRoleKey } from '../../app/creditRoles.ts'
import { useSelection } from '../../stores/selection.ts'
import { drawGraph, ENTER_MS, type Palette, type Transform } from './drawGraph.ts'
import type { DerivedGraph, GraphNode } from './graphModel.ts'
import { createHitTester, type HitTester } from './hitTest.ts'
import { createLayoutEngine, WORKER_NODE_THRESHOLD, type LayoutEngine } from './layoutEngine.ts'

const dark = { background: '#0f1218', text: '#e8eaf0', link: '#a3abbd', song: '#e8eaf0', selected: '#f5a524' }
const light = { background: '#f4f5f8', text: '#151822', link: '#4a5163', song: '#151822', selected: '#8f5400' }

function paletteFor(scheme: 'dark' | 'light'): Palette {
  const colours = scheme === 'dark' ? dark : light
  const roles = Object.fromEntries(
    creditRoles.map((role) => [role, creditRoleStyles[role].colors[scheme]]),
  ) as Record<CreditRoleKey, string>
  return { ...colours, roles }
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * The graph drawn on a canvas (FR-HUB-01, NFR-PERF-03). React owns this component's element and its props; D3 owns
 * everything inside the canvas: the forces, the zoom and the hit testing. The two meet in the effects below, and
 * nothing here re-renders React while the graph moves.
 */
export function GraphCanvas({ graph }: { graph: DerivedGraph }) {
  const { colorScheme } = useColorScheme()
  const scheme = colorScheme === 'light' ? 'light' : 'dark'
  const palette = useMemo(() => paletteFor(scheme), [scheme])

  const selectedId = useSelection((state) => state.selectedId)
  const selectNode = useSelection((state) => state.select)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const frame = useRef({
    width: 0,
    height: 0,
    dpr: 1,
    transform: { x: 0, y: 0, k: 1 },
    nodes: new Map<string, GraphNode>(),
    links: graph.links,
    personCount: graph.personCount,
    hoveredId: null as string | null,
    selectedId: null as string | null,
    born: new Map<string, number>(),
    palette,
    userMoved: false,
    hit: null as HitTester | null,
    redraw: (): void => undefined,
    fit: (): void => undefined,
    engine: null as LayoutEngine | null,
  })
  const selectRef = useRef(selectNode)
  const zoomRef = useRef<ZoomBehavior<HTMLCanvasElement, unknown> | null>(null)
  const useWorker = graph.nodes.length > WORKER_NODE_THRESHOLD

  // Values the draw loop and the pointer handlers read are kept in a ref, so changing them never rebuilds the canvas.
  useEffect(() => {
    selectRef.current = selectNode
    frame.current.selectedId = selectedId
    frame.current.palette = palette
    frame.current.redraw()
  }, [selectNode, selectedId, palette])

  // The canvas, its size, the zoom and the pointer: set up once.
  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return
    const state = frame.current
    const context = canvas.getContext('2d')
    if (context === null) return // no 2D canvas (a test environment): the list view still has everything

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
        links: state.links,
        hoveredId: state.hoveredId,
        selectedId: state.selectedId,
        born: state.born,
        now: performance.now(),
        palette: state.palette,
        personCount: state.personCount,
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

    // Zoom and pan. d3-zoom turns wheel, drag and pinch into one transform; the canvas only has to apply it.
    const behaviour = zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.15, 8])
      .on('zoom', (event: { transform: Transform; sourceEvent: Event | null }) => {
        state.transform = { x: event.transform.x, y: event.transform.y, k: event.transform.k }
        if (event.sourceEvent !== null) state.userMoved = true
        schedule()
      })
    zoomRef.current = behaviour
    select(canvas).call(behaviour).on('dblclick.zoom', null)

    // Where the middle of the graph is on screen: the simulation is centred on 0,0.
    state.fit = () => {
      const nodes = [...state.nodes.values()]
      if (nodes.length === 0 || state.width === 0) {
        behaviour.transform(select(canvas), zoomIdentity.translate(state.width / 2, state.height / 2))
        return
      }
      const xs = nodes.map((node) => node.x ?? 0)
      const ys = nodes.map((node) => node.y ?? 0)
      const pad = 40
      const w = Math.max(...xs) - Math.min(...xs) + pad * 2
      const h = Math.max(...ys) - Math.min(...ys) + pad * 2
      const k = Math.min(2, Math.max(0.15, Math.min(state.width / w, state.height / h)))
      const cx = (Math.max(...xs) + Math.min(...xs)) / 2
      const cy = (Math.max(...ys) + Math.min(...ys)) / 2
      behaviour.transform(select(canvas), zoomIdentity.translate(state.width / 2 - cx * k, state.height / 2 - cy * k).scale(k))
    }

    function pointToGraph(event: PointerEvent) {
      const box = canvas!.getBoundingClientRect()
      const { x, y, k } = state.transform
      return { gx: (event.clientX - box.left - x) / k, gy: (event.clientY - box.top - y) / k, k }
    }

    function onMove(event: PointerEvent) {
      const { gx, gy, k } = pointToGraph(event)
      const hit = state.hit?.find(gx, gy, k) ?? null
      if ((hit?.id ?? null) !== state.hoveredId) {
        state.hoveredId = hit?.id ?? null
        canvas!.style.cursor = hit === null ? 'grab' : 'pointer'
        schedule()
      }
    }
    function onLeave() {
      if (state.hoveredId !== null) {
        state.hoveredId = null
        schedule()
      }
    }
    // A click selects the node under the pointer; a click on empty space clears the selection. A drag is not a click:
    // `click` is not fired after d3-zoom has moved the view.
    function onClick(event: MouseEvent) {
      const { gx, gy, k } = pointToGraph(event as PointerEvent)
      selectRef.current(state.hit?.find(gx, gy, k)?.id ?? null)
    }

    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerleave', onLeave)
    canvas.addEventListener('click', onClick)
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()

    return () => {
      observer.disconnect()
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('click', onClick)
      select(canvas).on('.zoom', null)
      state.redraw = () => undefined
      state.fit = () => undefined
    }
  }, [])

  // The layout engine: created for the current size class (page thread, or a worker above 500 nodes) and given the
  // graph whenever it changes. Positions come back as arrays and are written onto the nodes the canvas draws.
  useEffect(() => {
    const state = frame.current

    const engine = createLayoutEngine(useWorker, {
      onPositions(ids, xy) {
        ids.forEach((id, index) => {
          const node = state.nodes.get(id)
          if (node !== undefined) {
            node.x = xy[index * 2]!
            node.y = xy[index * 2 + 1]!
          }
        })
        state.hit = createHitTester([...state.nodes.values()])
        state.redraw()
      },
      onSettled() {
        // When the picture has come to rest and the person has not moved it themselves, show all of it.
        if (!state.userMoved) state.fit()
        state.redraw()
      },
    })
    state.engine = engine
    // Hand the new engine the positions the nodes already have, so a switch of thread does not scatter the graph.
    engine.update({
      nodes: [...state.nodes.values()].map((node) => ({ id: node.id, r: node.r, x: node.x, y: node.y })),
      links: state.links,
    })

    return () => {
      engine.dispose()
      state.engine = null
    }
  }, [useWorker])

  // The graph changed: merge it into the nodes the canvas holds (keeping positions), note which are new for the
  // fade-in, and tell the layout.
  useEffect(() => {
    const state = frame.current
    const reduced = prefersReducedMotion()
    const now = performance.now()
    const next = new Map<string, GraphNode>()

    for (const node of graph.nodes) {
      const existing = state.nodes.get(node.id)
      if (existing === undefined) {
        next.set(node.id, node)
        if (!reduced && state.nodes.size > 0) state.born.set(node.id, now)
      } else {
        // Keep the object (and so its position and velocity); take the fields that may have changed.
        Object.assign(existing, { ...node, x: existing.x, y: existing.y, vx: existing.vx, vy: existing.vy })
        next.set(node.id, existing)
      }
    }
    for (const id of state.born.keys()) {
      if (!next.has(id) || now - state.born.get(id)! > ENTER_MS) state.born.delete(id)
    }

    state.nodes = next
    state.links = graph.links
    state.personCount = graph.personCount
    state.engine?.update({
      nodes: [...next.values()].map((node) => ({ id: node.id, r: node.r, x: node.x, y: node.y })),
      links: graph.links,
    })
    state.redraw()
  }, [graph])

  const description = `Graph of ${graph.songCount} ${graph.songCount === 1 ? 'song' : 'songs'} and ${graph.personCount} ${graph.personCount === 1 ? 'person' : 'people'}. The lists below hold the same information.`

  return (
    <Box>
      <Box sx={{ position: 'relative', height: { xs: 340, md: 460 }, border: 1, borderColor: 'divider', borderRadius: 1 }}>
        {/* role="img" gives the canvas a name; its content is not readable by assistive technology, which is why the
            tables below carry the same data (NFR-A11Y-01). */}
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={description}
          style={{ width: '100%', height: '100%', display: 'block', borderRadius: 4, touchAction: 'none', cursor: 'grab' }}
        />
        <Button
          size="small"
          variant="outlined"
          color="inherit"
          sx={{ position: 'absolute', top: 8, right: 8 }}
          onClick={() => {
            frame.current.userMoved = false
            frame.current.fit()
          }}
        >
          Reset view
        </Button>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
        Drag to move, scroll or pinch to zoom, click a node to see its details. Squares are songs, circles are people,
        larger circles are credited on more songs. The tables below have the same information for keyboards and screen
        readers.
      </Typography>
    </Box>
  )
}
