import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import LinearProgress from '@mui/material/LinearProgress'
import Typography from '@mui/material/Typography'
import { lazy, Suspense } from 'react'
import { useAddSheet } from '../search/addSheet.ts'
import { useGraphSession } from './graphSession.ts'

// The graph carries SignalR and D3, so it is a chunk of its own: a first-time visitor never downloads it.
const GraphView = lazy(() => import('./GraphView.tsx').then((module) => ({ default: module.GraphView })))

/** The workspace at `/graph`: the person's graph, or an invitation to add a first song. */
export function GraphPage() {
  const session = useGraphSession()
  const { openSheet } = useAddSheet()

  if (session === null) {
    return (
      <Box>
        <Typography variant="h1" gutterBottom>
          Your graph
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          Your graph is empty. Add a song to see who produced and wrote it.
        </Typography>
        <Button variant="contained" onClick={openSheet}>
          + Add a song
        </Button>
      </Box>
    )
  }

  return (
    <Suspense fallback={<LinearProgress aria-label="Loading your graph" />}>
      <GraphView session={session} />
    </Suspense>
  )
}
