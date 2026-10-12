import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Typography from '@mui/material/Typography'
import { scaleLinear } from 'd3-scale'
import { creditRoleStyles } from '../../app/creditRoles.ts'
import type { PersonNode } from '../graph/graphModel.ts'

/**
 * The top hubs as a small bar chart (spec section 12): one row per person, a bar as long as their song count, and the
 * count as text, so the number is never only a length. Each row selects that person in the graph.
 *
 * D3 is used here for its scale only. React draws the bars: for ten rows an element each is simpler than a D3 data
 * join, and it keeps the rows ordinary, focusable buttons.
 */
export function HubBar({
  hubs,
  selectedId,
  onSelect,
  limit = 8,
}: {
  hubs: readonly PersonNode[]
  selectedId: string | null
  onSelect: (id: string) => void
  limit?: number
}) {
  const shown = hubs.slice(0, limit)
  const most = Math.max(1, ...shown.map((hub) => hub.songs))
  // A scale maps a domain (song counts) to a range (percent of the row), so the longest bar always fills the row.
  const width = scaleLinear().domain([0, most]).range([0, 100])

  return (
    <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.5 }}>
      {shown.map((hub) => {
        const { colors } = creditRoleStyles[hub.roles[0] ?? 'other']
        return (
          <li key={hub.id}>
            <ButtonBase
              onClick={() => onSelect(hub.id)}
              aria-pressed={hub.id === selectedId}
              sx={(theme) => ({
                width: '100%',
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto',
                columnGap: 1,
                rowGap: 0.25,
                textAlign: 'left',
                p: 0.75,
                borderRadius: 1,
                border: 1,
                borderColor: hub.id === selectedId ? 'primary.main' : 'transparent',
                '&:hover': { bgcolor: 'action.hover' },
                '& .bar': { bgcolor: colors.dark },
                ...theme.applyStyles('light', { '& .bar': { bgcolor: colors.light } }),
              })}
            >
              <Typography variant="body2" noWrap title={hub.name}>
                {hub.name}
              </Typography>
              <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {hub.songs} {hub.songs === 1 ? 'song' : 'songs'}
              </Typography>
              <Box sx={{ gridColumn: '1 / -1', height: 6, borderRadius: 3, bgcolor: 'action.hover' }} aria-hidden>
                <Box className="bar" sx={{ height: '100%', borderRadius: 3, width: `${width(hub.songs)}%` }} />
              </Box>
            </ButtonBase>
          </li>
        )
      })}
    </Box>
  )
}
