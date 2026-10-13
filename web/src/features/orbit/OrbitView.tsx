import { select } from 'd3-selection'
import { zoom as d3zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior } from 'd3-zoom'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import { creditRoleStyles, roleText } from '../../app/creditRoles.ts'
import type { Workspace } from '../graph/workspaceModel.ts'
import type { NodeRef, OrbitNode, StageSize } from './orbitLayout.ts'
import { OrbitScene } from './OrbitScene.tsx'
import { OrbitSvg } from './orbitStyles.ts'
import { OrbitTooltip, type TooltipContent } from './OrbitTooltip.tsx'

// A fixed sprinkling of stars: the same on every render, so nothing about the background is ever random.
const stars = (() => {
  let seed = 11
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  return Array.from({ length: 140 }, (_, index) => ({
    x: (random() - 0.5) * 2000,
    y: (random() - 0.5) * 1400,
    r: 0.4 + random() * 1,
    opacity: 0.1 + random() * 0.4,
    twinkle: index % 5 === 0,
    delay: random() * 3,
  }))
})()

// jsdom has no layout and no ResizeObserver; a test gets this size.
const fallbackStage: StageSize = { width: 800, height: 600 }

interface OrbitViewProps {
  workspace: Workspace
  centre: NodeRef
  /** A node was chosen: it becomes the centre (FR-VIEW-01). */
  onCentre: (ref: NodeRef) => void
  /** The "+N more" node was chosen: the Text view shows everyone. */
  onMore: () => void
}

/**
 * The orbit (FR-VIEW-01, FR-HUB-01) in its stage: it measures the stage, pans and zooms the drawing, and shows the
 * tooltip. What is drawn, and how it moves, is `OrbitScene`.
 */
export function OrbitView({ workspace, centre, onCentre, onMore }: OrbitViewProps) {
  const dotsId = useId()
  const svgRef = useRef<SVGSVGElement>(null)
  const worldRef = useRef<SVGGElement>(null)
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  // Not known until the stage is on screen: the first layout waits for it, so the first bloom is drawn at the right size.
  const [stage, setStage] = useState<StageSize | null>(typeof ResizeObserver === 'undefined' ? fallbackStage : null)
  const [hover, setHover] = useState<{ id: string; content: TooltipContent; x: number; y: number } | null>(null)

  useLayoutEffect(() => {
    const svg = svgRef.current
    if (svg === null || typeof ResizeObserver === 'undefined') return

    let timer: ReturnType<typeof setTimeout> | undefined
    const measure = () => {
      const { width, height } = svg.getBoundingClientRect()
      if (width < 10 || height < 10) return
      setStage((current) => (current !== null && Math.abs(current.width - width) < 2 && Math.abs(current.height - height) < 2 ? current : { width, height }))
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

  // Pan and zoom: d3-zoom moves the world group directly, because a state update per wheel tick would re-render every node.
  useEffect(() => {
    const svg = svgRef.current
    const world = worldRef.current
    if (svg === null || world === null) return
    const behaviour = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.45, 3])
      .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => world.setAttribute('transform', event.transform.toString()))
    zoomRef.current = behaviour
    select(svg).call(behaviour).on('dblclick.zoom', null)
    return () => {
      select(svg).on('.zoom', null)
      zoomRef.current = null
    }
  }, [])

  // The centre of the orbit is the origin, so the view starts with the origin at the middle of the stage.
  useLayoutEffect(() => {
    const svg = svgRef.current
    const behaviour = zoomRef.current
    if (svg === null || behaviour === null || stage === null) return
    behaviour.transform(select(svg), zoomIdentity.translate(stage.width / 2, stage.height / 2 + (stage.width < 560 ? 26 : 14)))
  }, [stage])

  const describe = useCallback(
    (node: OrbitNode): TooltipContent | null => {
      if (node.kind === 'song') {
        const song = workspace.songById.get(node.ref)
        return { kind: 'song', title: song?.title ?? '', year: song?.year ?? null, artist: song?.artist ?? '', credits: song?.credits.length ?? 0 }
      }
      if (node.kind === 'person') {
        const person = workspace.personById.get(node.ref)
        const onCentre = centre.type === 'song' && person !== undefined ? person.bySong.get(centre.id) : undefined
        const roles =
          onCentre !== undefined && onCentre.length > 0
            ? onCentre.map((credit) => ({ role: credit.role, text: roleText(credit.role, credit.detail) }))
            : (person?.roles ?? []).map((role) => ({ role, text: creditRoleStyles[role].label }))
        return { kind: 'person', name: person?.name ?? '', songs: person?.songs.length ?? 0, roles }
      }
      return null
    },
    [workspace, centre.type, centre.id],
  )

  const onHover = useCallback(
    (node: OrbitNode, x: number, y: number) => {
      const content = describe(node)
      if (content !== null) setHover({ id: node.id, content, x, y })
    },
    [describe],
  )
  const onLeave = useCallback(() => setHover(null), [])

  // The tooltip follows the pointer by a transform written on every move, not by a render.
  const onMove = useCallback((event: MouseEvent) => {
    const rect = svgRef.current?.getBoundingClientRect()
    const tip = tooltipRef.current
    if (rect === undefined || tip === null) return
    let x = event.clientX - rect.left + 14
    let y = event.clientY - rect.top + 14
    if (x + 250 > rect.width) x -= 270
    if (y + 120 > rect.height) y -= 130
    tip.style.transform = `translate(${x}px, ${y}px)`
  }, [])

  const onChoose = useCallback(
    (node: OrbitNode) => {
      if (node.depth === 0) return
      setHover(null)
      if (node.kind === 'more') onMore()
      else onCentre({ type: node.kind, id: node.ref })
    },
    [onCentre, onMore],
  )

  const centreName = centre.type === 'song' ? workspace.songById.get(centre.id)?.title : workspace.personById.get(centre.id)?.name

  return (
    <>
      {/* role="group", not "img": the children of an image are presentational, and the nodes are buttons. */}
      <OrbitSvg ref={svgRef} role="group" aria-label={`Credits graph, centred on ${centreName ?? 'your graph'}`}>
        <defs>
          <pattern id={dotsId} width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="12" cy="12" r="0.9" fill="#ffffff16" />
          </pattern>
        </defs>

        <g ref={worldRef}>
          <rect x={-3000} y={-3000} width={6000} height={6000} fill={`url(#${dotsId})`} aria-hidden="true" />

          <g opacity={0.5} aria-hidden="true">
            {stars.map((star, index) => (
              <circle
                key={index}
                className={star.twinkle ? 'star tw' : 'star'}
                cx={star.x}
                cy={star.y}
                r={star.r}
                opacity={star.opacity}
                style={star.twinkle ? { animationDelay: `${star.delay.toFixed(2)}s` } : undefined}
              />
            ))}
          </g>

          {stage !== null && (
            <OrbitScene
              workspace={workspace}
              centre={centre}
              stage={stage}
              focusId={hover?.id ?? null}
              svgRef={svgRef}
              onChoose={onChoose}
              onHover={onHover}
              onLeave={onLeave}
              onMove={onMove}
            />
          )}
        </g>
      </OrbitSvg>

      {hover !== null && <OrbitTooltip ref={tooltipRef} content={hover.content} x={hover.x} y={hover.y} />}
    </>
  )
}
