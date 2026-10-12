import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import LinearProgress from '@mui/material/LinearProgress'
import Typography from '@mui/material/Typography'
import { GraphListView } from './GraphListView.tsx'
import type { GraphSnapshot } from './graphEvents.ts'
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

/** Your graph, shown as the accessible list (FR-GRAPH-01..04, NFR-A11Y-01). The canvas joins it in the next pull request. */
export function GraphView({ session }: { session: GraphSession }) {
  const graph = useLiveGraph(session)
  const remove = useRemoveSong(session)
  const snapshot = graph.snapshot

  const status = snapshot ? crawlText(snapshot.crawl) : null
  const connectionNote = liveText(graph.live)
  const songCount = snapshot?.songs.length ?? 0

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
