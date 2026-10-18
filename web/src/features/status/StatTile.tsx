import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { formatValue } from './statusModel.ts'
import type { Tile } from './tiles.ts'

const width = 100
const height = 28

/**
 * A tiny line of the tile's points. A gap (a step that was not measured) breaks the line, so the sparkline never joins
 * two stretches of data across a time nobody measured (spec principle 5). It is decoration: the tile says the number.
 */
export function Sparkline({ points }: { points: readonly (number | null)[] }) {
  const values = points.filter((p): p is number => p !== null)
  if (values.length < 2) return null

  const low = Math.min(...values)
  const high = Math.max(...values)
  const span = high - low || 1
  const x = (i: number) => (points.length === 1 ? 0 : (i / (points.length - 1)) * width)
  const y = (v: number) => height - 2 - ((v - low) / span) * (height - 4)

  let path = ''
  let open = false
  points.forEach((p, i) => {
    if (p === null) {
      open = false
      return
    }
    path += `${open ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p).toFixed(1)} `
    open = true
  })

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} aria-hidden="true" focusable="false" preserveAspectRatio="none">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/** A number with its name and a sparkline (spec section 11, "Stat tiles"). */
export function StatTile({ tile }: { tile: Tile }) {
  return (
    <Box
      component="li"
      sx={(theme) => ({ listStyle: 'none', p: 1.5, border: `1px solid ${theme.vars.palette.lineStrong}`, borderRadius: 1, minWidth: 0 })}
    >
      <Typography color="text.secondary" sx={{ fontSize: 12.5 }}>
        {tile.label}
      </Typography>
      <Typography sx={{ fontSize: 22, fontWeight: 600, lineHeight: 1.2, mb: 0.5 }}>{formatValue(tile.unit, tile.value)}</Typography>
      <Box sx={{ color: 'text.secondary' }}>
        <Sparkline points={tile.points} />
      </Box>
    </Box>
  )
}
