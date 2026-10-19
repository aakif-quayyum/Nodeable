import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Typography from '@mui/material/Typography'
import { RangeToggle } from './RangeToggle.tsx'
import { type Range, refreshChoices } from './statusModel.ts'

interface StatusControlsProps {
  range: Range
  onRange: (range: Range) => void
  refreshMs: number
  onRefresh: (ms: number) => void
  zoomed: boolean
  onResetZoom: () => void
  updatedAt: number | null
  onSignOut: () => void
}

/** The time range, the auto-refresh and the zoom reset (spec section 11, "The status page"). */
export function StatusControls({ range, onRange, refreshMs, onRefresh, zoomed, onResetZoom, updatedAt, onSignOut }: StatusControlsProps) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
      <RangeToggle value={zoomed ? null : range} onChange={onRange} />

      <FormControl size="small" sx={{ minWidth: 150 }}>
        <InputLabel id="status-refresh-label">Refresh</InputLabel>
        <Select
          labelId="status-refresh-label"
          label="Refresh"
          value={zoomed ? 0 : refreshMs}
          disabled={zoomed}
          onChange={(event) => onRefresh(Number(event.target.value))}
        >
          {refreshChoices.map((choice) => (
            <MenuItem key={choice.ms} value={choice.ms}>
              {choice.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {zoomed && (
        <Button size="small" variant="outlined" onClick={onResetZoom}>
          Reset zoom
        </Button>
      )}

      <Typography color="text.secondary" sx={{ fontSize: 13, ml: { md: 'auto' } }} aria-live="polite">
        {zoomed ? 'Zoomed in: refresh is paused. ' : ''}
        {updatedAt === null ? '' : `Updated ${new Date(updatedAt).toLocaleTimeString()}`}
      </Typography>

      <Button size="small" onClick={onSignOut}>
        Sign out
      </Button>
    </Box>
  )
}
