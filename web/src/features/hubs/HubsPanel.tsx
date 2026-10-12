import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { useSelection } from '../../stores/selection.ts'
import type { PersonNode } from '../graph/graphModel.ts'
import { HubBar } from './HubBar.tsx'

/** "Your hubs": the people credited on two or more songs of the graph, most songs first (FR-HUB-02). */
export function HubsPanel({ hubs }: { hubs: readonly PersonNode[] }) {
  const selectedId = useSelection((state) => state.selectedId)
  const select = useSelection((state) => state.select)

  return (
    <Box component="section" aria-labelledby="hubs-heading">
      <Typography variant="h3" id="hubs-heading" sx={{ fontSize: '1rem', fontWeight: 600, mb: 1 }}>
        Your hubs
      </Typography>
      {hubs.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No one is credited on two songs yet. Add more songs and the people they share will appear here.
        </Typography>
      ) : (
        <HubBar hubs={hubs} selectedId={selectedId} onSelect={select} />
      )}
    </Box>
  )
}
