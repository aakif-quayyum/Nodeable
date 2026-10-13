import Box from '@mui/material/Box'
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { creditRoleStyles } from '../../app/creditRoles.ts'
import type { GraphNode } from '../graph/graphModel.ts'
import type { Workspace } from '../graph/workspaceModel.ts'
import type { NodeRef } from '../orbit/orbitLayout.ts'
import { OrbitTooltip, type TooltipContent } from '../orbit/OrbitTooltip.tsx'
import { constellationOf, rendererFor } from './constellationModel.ts'
import { ConstellationCanvas } from './ConstellationCanvas.tsx'
import { ConstellationSvg } from './ConstellationSvg.tsx'
import { LayoutController } from './LayoutController.ts'

interface ConstellationViewProps {
  workspace: Workspace
  /** A node was chosen: the orbit opens on it (FR-VIEW-02). */
  onCentre: (ref: NodeRef) => void
}

/**
 * The whole graph as a force layout (FR-VIEW-02, FR-HUB-01): SVG while it is small enough for every node to be a
 * button, a canvas above the threshold. Both read one layout (`LayoutController`) and one model, and both open the
 * orbit on the node that is chosen. This component owns what they share: the model, the layout, and the tooltip.
 */
export function ConstellationView({ workspace, onCentre }: ConstellationViewProps) {
  const graph = useMemo(() => constellationOf(workspace), [workspace])
  const renderer = rendererFor(graph.nodes.length)
  const [controller] = useState(() => new LayoutController())
  useEffect(() => () => controller.dispose(), [controller])

  const rootRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<{ id: string; content: TooltipContent; x: number; y: number } | null>(null)

  const onHover = useCallback(
    (node: GraphNode | null, x: number, y: number) => {
      if (node === null) {
        setHover(null)
        return
      }
      const content: TooltipContent =
        node.kind === 'song'
          ? {
              kind: 'song',
              title: node.title,
              artist: node.artist,
              year: node.year,
              credits: Math.max(0, (graph.neighbours.get(node.id)?.size ?? 1) - 1),
            }
          : {
              kind: 'person',
              name: node.name,
              songs: node.songs,
              roles: node.roles.map((role) => ({ role, text: creditRoleStyles[role].label })),
            }
      setHover({ id: node.id, content, x, y })
    },
    [graph],
  )

  // The tooltip follows the pointer by a transform written on every move, not by a render.
  const onMove = useCallback((event: MouseEvent) => {
    const rect = rootRef.current?.getBoundingClientRect()
    const tip = tooltipRef.current
    if (rect === undefined || tip === null) return
    let x = event.clientX - rect.left + 14
    let y = event.clientY - rect.top + 14
    if (x + 250 > rect.width) x -= 270
    if (y + 120 > rect.height) y -= 130
    tip.style.transform = `translate(${x}px, ${y}px)`
  }, [])

  const onChoose = useCallback(
    (node: GraphNode) => {
      setHover(null)
      onCentre({ type: node.kind, id: node.mbid })
    },
    [onCentre],
  )

  const shared = { graph, controller, focusId: hover?.id ?? null, onChoose, onHover, onMove }

  return (
    <Box ref={rootRef} data-renderer={renderer} sx={{ position: 'absolute', inset: 0 }}>
      {renderer === 'svg' ? <ConstellationSvg {...shared} /> : <ConstellationCanvas {...shared} />}
      {hover !== null && <OrbitTooltip ref={tooltipRef} content={hover.content} x={hover.x} y={hover.y} />}
    </Box>
  )
}
