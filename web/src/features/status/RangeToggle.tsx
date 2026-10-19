import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { type Range, rangeLabels, ranges } from './statusModel.ts'

interface RangeToggleProps {
  /** The range that is chosen, or null when no range is (a zoomed window replaces it). */
  value: Range | null
  onChange: (range: Range) => void
}

/** 1 hour, 6 hours, 24 hours or 7 days: the one control the About page's panels have, and the first of the status page's. */
export function RangeToggle({ value, onChange }: RangeToggleProps) {
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={value}
      onChange={(_, next: Range | null) => {
        if (next !== null) onChange(next)
      }}
      aria-label="Time range"
    >
      {ranges.map((r) => (
        <ToggleButton key={r} value={r}>
          {rangeLabels[r]}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  )
}
