import Typography from '@mui/material/Typography'
import { useId, useState } from 'react'
import Button from '@mui/material/Button'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import { EChart } from '../../charts/EChart.tsx'
import { useChartScheme } from '../../charts/useChartScheme.ts'
import { gaugeOption, heatmapOption } from '../../charts/options.ts'
import { useReducedMotion } from '../../motion/useReducedMotion.ts'
import { PanelFrame } from './ChartPanel.tsx'
import { formatSeconds, freshnessBand, type MetricsResponse } from './statusModel.ts'

type Heatmap = NonNullable<MetricsResponse['heatmap']>

/** The age of the oldest job that is ready to run, against the freshness objective's 10-minute limit. */
export function QueueGauge({ seconds }: { seconds: number | null }) {
  const headingId = useId()
  const scheme = useChartScheme()
  const reducedMotion = useReducedMotion()
  const summary = `The oldest job that is ready to run has waited ${seconds === null ? 'an unmeasured time' : formatSeconds(seconds)}. ${freshnessBand(seconds)}`

  return (
    <PanelFrame headingId={headingId} title="Oldest job waiting" summary={summary}>
      <EChart option={gaugeOption(seconds, { scheme, reducedMotion })} height={220} label={summary} />
      <Typography color="text.secondary" sx={{ fontSize: 12.5 }}>
        Green up to 5 minutes, yellow up to the 10-minute limit, red beyond it.
      </Typography>
    </PanelFrame>
  )
}

/** MusicBrainz response times: how many requests fell in each time bound, minute by minute. */
export function LatencyHeatmap({ response, heatmap }: { response: MetricsResponse; heatmap: Heatmap }) {
  const headingId = useId()
  const scheme = useChartScheme()
  const reducedMotion = useReducedMotion()
  const [asTable, setAsTable] = useState(false)
  const total = heatmap.cells.reduce((sum, cell) => sum + (cell[2] ?? 0), 0)
  const summary =
    total === 0
      ? 'No MusicBrainz request was timed in this window.'
      : `${total} MusicBrainz requests were timed; the darker a cell, the more requests fell in that response time at that moment.`

  // The table form: one row for each response-time bound, with the requests in it over the whole window.
  const perBound = heatmap.bounds.map((bound, index) => ({
    bound,
    count: heatmap.cells.filter((cell) => cell[1] === index).reduce((sum, cell) => sum + (cell[2] ?? 0), 0),
  }))

  return (
    <PanelFrame headingId={headingId} title="MusicBrainz response time" summary={summary}>
      <Button size="small" onClick={() => setAsTable((on) => !on)} aria-pressed={asTable} sx={{ justifySelf: 'start' }}>
        {asTable ? 'View as chart' : 'View as table'}
      </Button>
      {asTable ? (
        <Table size="small" aria-labelledby={headingId}>
          <TableHead>
            <TableRow>
              <TableCell>Response time</TableCell>
              <TableCell>Requests</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {perBound.map((row) => (
              <TableRow key={row.bound}>
                <TableCell>{row.bound === 'inf' ? 'slower than the last bound' : `up to ${row.bound} s`}</TableCell>
                <TableCell>{row.count}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <EChart option={heatmapOption(response, heatmap.bounds, heatmap.cells, { scheme, reducedMotion })} height={260} label={summary} />
      )}
    </PanelFrame>
  )
}
