import ChevronLeft from '@mui/icons-material/ChevronLeft'
import ChevronRight from '@mui/icons-material/ChevronRight'
import Alert from '@mui/material/Alert'
import Badge from '@mui/material/Badge'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useMemo, useState } from 'react'
import { creditRoles } from '../../app/creditRoles.ts'
import { useRoleFilters } from '../../stores/roleFilters.ts'
import { useSelection } from '../../stores/selection.ts'
import { HubsPanel } from '../hubs/HubsPanel.tsx'
import { GraphCanvas } from './GraphCanvas.tsx'
import { GraphListView } from './GraphListView.tsx'
import { filterCredits, hubsOf, deriveGraph } from './graphModel.ts'
import { hasIncompleteCredits, type GraphSnapshot } from './graphEvents.ts'
import type { GraphSession } from './graphSession.ts'
import { NodePanel } from './NodePanel.tsx'
import { RoleFilters } from './RoleFilters.tsx'
import { useRemoveSong } from './useGraphMutations.ts'
import { useLiveGraph, type LiveState } from './useLiveGraph.ts'

function crawlText(crawl: GraphSnapshot['crawl']): string | null {
  const parts: string[] = []
  if (crawl.queued > 0) {
    const seconds = crawl.etaSeconds
    parts.push(
      `Fetching credits: ${crawl.queued} ${crawl.queued === 1 ? 'lookup' : 'lookups'} waiting` +
        (seconds > 0 ? `, about ${seconds} ${seconds === 1 ? 'second' : 'seconds'} to go` : ''),
    )
  }
  if (crawl.failed > 0) {
    parts.push(`${crawl.failed} ${crawl.failed === 1 ? 'lookup' : 'lookups'} could not be completed`)
  }
  return parts.length === 0 ? null : parts.join('. ')
}

function liveText(live: LiveState): string | null {
  if (live === 'reconnecting') return 'Reconnecting: changes will show when the connection is back.'
  if (live === 'offline') return 'Live updates are off. Reload the page to get them back.'
  return null
}

const leftPanelWidth = 280
const rightPanelWidth = 340
const collapsedWidth = 48

/**
 * Your graph (FR-GRAPH-01..04, FR-HUB-01..03, NFR-A11Y-01): the canvas with a collapsible left panel for hubs and role
 * filters and a right panel for the selected node; on a phone the two panels are bottom sheets. The accessible tables
 * of the same data follow.
 */
export function GraphView({ session }: { session: GraphSession }) {
  const graph = useLiveGraph(session)
  const remove = useRemoveSong(session)
  const snapshot = graph.snapshot

  const wide = useMediaQuery((theme) => theme.breakpoints.up('md'))
  const [leftOpen, setLeftOpen] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)

  const active = useRoleFilters((state) => state.active)
  const selectedId = useSelection((state) => state.selectedId)
  const select = useSelection((state) => state.select)

  // What is on screen is the snapshot with the credits of the roles that are switched on. The hubs are worked out from
  // that, not read from the server's list, so they follow the filters; with every role on they are the same people.
  const visible = useMemo(() => (snapshot ? filterCredits(snapshot, active) : null), [snapshot, active])
  const derived = useMemo(() => (visible ? deriveGraph(visible) : null), [visible])
  const hubs = useMemo(() => (derived ? hubsOf(derived) : []), [derived])
  // The badge is about the song's credits, not about what the filters leave on screen.
  const incomplete = useMemo(
    () => new Set(snapshot?.songs.filter((song) => hasIncompleteCredits(snapshot, song)).map((song) => song.mbid)),
    [snapshot],
  )

  const status = snapshot ? crawlText(snapshot.crawl) : null
  const connectionNote = liveText(graph.live)
  const songCount = snapshot?.songs.length ?? 0
  const filtersOff = creditRoles.length - active.size

  const panels = (
    <Box sx={{ display: 'grid', gap: 3 }}>
      {derived && <HubsPanel hubs={hubs} />}
      <RoleFilters />
    </Box>
  )

  const details =
    derived && visible ? (
      <NodePanel graph={derived} snapshot={visible} selectedId={selectedId} onClose={() => select(null)} />
    ) : null
  const hasSelection = selectedId !== null && derived?.nodes.some((node) => node.id === selectedId) === true

  return (
    <Box component="section" aria-labelledby="graph-heading" aria-busy={graph.isPending}>
      <Typography variant="h1" id="graph-heading" sx={{ fontSize: '1.75rem' }} gutterBottom>
        Your graph
        {snapshot && songCount > 0 ? ` · ${songCount} ${songCount === 1 ? 'song' : 'songs'}` : ''}
      </Typography>

      {graph.isPending && <LinearProgress aria-label="Loading your graph" />}

      {graph.isError && snapshot === undefined && (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" size="small" onClick={graph.refetch}>
              Try again
            </Button>
          }
        >
          Your graph could not be loaded.
        </Alert>
      )}

      {/* One status region for everything that changes by itself, so a screen reader hears progress without focus moving. */}
      <Typography role="status" color="text.secondary" variant="body2" sx={{ minHeight: '1.5em', mb: 1 }}>
        {[status, connectionNote].filter(Boolean).join(' ')}
      </Typography>

      {remove.isError && <Alert severity="warning">That song could not be removed. Try again.</Alert>}

      {snapshot && songCount === 0 && (
        <Typography color="text.secondary">
          Your graph is empty. Search for a song and choose “Add to graph”.
        </Typography>
      )}

      {snapshot && visible && derived && songCount > 0 && (
        <Box sx={{ mb: 3 }}>
          {!wide && (
            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <Badge color="warning" badgeContent={filtersOff} invisible={filtersOff === 0}>
                <Button variant="outlined" size="small" onClick={() => setSheetOpen(true)}>
                  Hubs and roles
                </Button>
              </Badge>
            </Box>
          )}

          <Box
            sx={{
              display: 'grid',
              gap: 2,
              alignItems: 'start',
              gridTemplateColumns: wide
                ? `${leftOpen ? leftPanelWidth : collapsedWidth}px minmax(0, 1fr)${hasSelection ? ` ${rightPanelWidth}px` : ''}`
                : 'minmax(0, 1fr)',
            }}
          >
            {wide && (
              <Box component="aside" aria-label="Hubs and role filters" sx={{ minWidth: 0 }}>
                <IconButton
                  size="small"
                  onClick={() => setLeftOpen((open) => !open)}
                  aria-expanded={leftOpen}
                  aria-controls="hubs-and-roles"
                  aria-label={leftOpen ? 'Hide hubs and roles' : 'Show hubs and roles'}
                  sx={{ mb: 1 }}
                >
                  {leftOpen ? <ChevronLeft /> : <ChevronRight />}
                </IconButton>
                <Box id="hubs-and-roles" hidden={!leftOpen} sx={{ maxHeight: 520, overflowY: 'auto' }}>
                  {panels}
                </Box>
              </Box>
            )}

            <GraphCanvas graph={derived} />

            {wide && hasSelection && <Box sx={{ minWidth: 0 }}>{details}</Box>}
          </Box>

          {/* The two panels as bottom sheets on a phone: a sheet keeps the canvas as large as the screen allows. */}
          {!wide && (
            <>
              <Drawer anchor="bottom" open={sheetOpen} onClose={() => setSheetOpen(false)}>
                <Box sx={{ p: 2, maxHeight: '70vh', overflowY: 'auto' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button size="small" onClick={() => setSheetOpen(false)}>
                      Done
                    </Button>
                  </Box>
                  {panels}
                </Box>
              </Drawer>
              <Drawer anchor="bottom" open={hasSelection} onClose={() => select(null)}>
                <Box sx={{ p: 2, maxHeight: '60vh', overflowY: 'auto' }}>{details}</Box>
              </Drawer>
            </>
          )}
        </Box>
      )}

      {snapshot && visible && songCount > 0 && (
        <GraphListView
          snapshot={visible}
          incomplete={incomplete}
          failures={graph.failures}
          removing={remove.isPending ? remove.variables : null}
          onRemove={(song) => remove.mutate(song.mbid)}
        />
      )}
    </Box>
  )
}
