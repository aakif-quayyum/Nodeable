import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import LinearProgress from '@mui/material/LinearProgress'
import Typography from '@mui/material/Typography'
import { useMemo } from 'react'
import { creditRoles } from '../../app/creditRoles.ts'
import { useSelection } from '../../stores/selection.ts'
import { GraphCanvas } from './GraphCanvas.tsx'
import { GraphListView } from './GraphListView.tsx'
import type { GraphSnapshot } from './graphEvents.ts'
import { deriveGraph } from './graphModel.ts'
import { NodePanel } from './NodePanel.tsx'
import { RoleChip } from './RoleChip.tsx'
import type { GraphSession } from './graphSession.ts'
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

/** Your graph: the canvas, the details of the selected node, and the accessible lists of the same data (FR-GRAPH-01..04, FR-HUB-01, NFR-A11Y-01). */
export function GraphView({ session }: { session: GraphSession }) {
  const graph = useLiveGraph(session)
  const remove = useRemoveSong(session)
  const snapshot = graph.snapshot

  const status = snapshot ? crawlText(snapshot.crawl) : null
  const connectionNote = liveText(graph.live)
  const songCount = snapshot?.songs.length ?? 0
  const derived = useMemo(() => (snapshot ? deriveGraph(snapshot) : null), [snapshot])
  const selectedId = useSelection((state) => state.selectedId)
  const select = useSelection((state) => state.select)

  return (
    <Box component="section" aria-labelledby="graph-heading" aria-busy={graph.isPending}>
      <Typography variant="h2" id="graph-heading" sx={{ fontSize: '1.25rem', fontWeight: 600 }} gutterBottom>
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

      {snapshot && derived && songCount > 0 && (
        <Box sx={{ mb: 3 }}>
          <GraphCanvas graph={derived} />
          <Box component="ul" aria-label="Role colours" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, listStyle: 'none', m: 0, mt: 1, p: 0 }}>
            {creditRoles.map((role) => (
              <li key={role}>
                <RoleChip role={role} />
              </li>
            ))}
          </Box>
          <NodePanel graph={derived} snapshot={snapshot} selectedId={selectedId} onClose={() => select(null)} />
        </Box>
      )}

      {snapshot && songCount > 0 && (
        <GraphListView
          snapshot={snapshot}
          failures={graph.failures}
          removing={remove.isPending ? remove.variables : null}
          onRemove={(song) => remove.mutate(song.mbid)}
        />
      )}
    </Box>
  )
}
