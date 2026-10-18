import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import type { EChartsCoreOption } from 'echarts/core'
import { type ReactNode, useId, useState } from 'react'
import { EChart } from '../../charts/EChart.tsx'
import { hasGaps, type PanelData, summarise, tableRows } from './statusModel.ts'

interface ChartPanelProps {
  panel: PanelData
  times: readonly string[]
  /** The words for the window ("the last 24 hours"), for the summary. */
  rangeText: string
  option: EChartsCoreOption
  group?: string
  onBrushEnd?: (fromMs: number, toMs: number) => void
  height?: number
}

/**
 * One panel (spec section 11): a heading, a sentence saying what the chart shows, the chart, and a "View as table" toggle
 * with the same numbers (NFR-A11Y-01). The chart is a picture of the table, not the only copy of the data.
 */
export function ChartPanel({ panel, times, rangeText, option, group, onBrushEnd, height = 220 }: ChartPanelProps) {
  const [asTable, setAsTable] = useState(false)
  const headingId = useId()
  const summary = summarise(panel, rangeText)

  return (
    <PanelFrame headingId={headingId} title={panel.title} summary={summary} gaps={hasGaps(panel)}>
      <Button size="small" onClick={() => setAsTable((on) => !on)} aria-pressed={asTable} sx={{ justifySelf: 'start' }}>
        {asTable ? 'View as chart' : 'View as table'}
      </Button>

      {asTable ? (
        <TableContainer sx={{ maxHeight: height + 40 }}>
          <Table size="small" stickyHeader aria-labelledby={headingId}>
            <TableHead>
              <TableRow>
                <TableCell>Time</TableCell>
                {panel.series.map((s) => (
                  <TableCell key={s.id}>{s.label}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {tableRows(times, panel).map((row) => (
                <TableRow key={row.time}>
                  <TableCell>{new Date(row.time).toLocaleString()}</TableCell>
                  {row.cells.map((cell, i) => (
                    <TableCell key={panel.series[i]!.id}>{cell}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <EChart option={option} height={height} label={summary} group={group} onBrushEnd={onBrushEnd} />
      )}
    </PanelFrame>
  )
}

/** The frame every panel shares: a section with a heading and a text summary above its content. */
export function PanelFrame({ headingId, title, summary, gaps, children }: { headingId: string; title: string; summary: string; gaps?: boolean; children: ReactNode }) {
  return (
    <Box
      component="section"
      aria-labelledby={headingId}
      sx={(theme) => ({ display: 'grid', gap: 1, p: 2, border: `1px solid ${theme.vars.palette.lineStrong}`, borderRadius: 1, minWidth: 0, alignContent: 'start' })}
    >
      <Typography id={headingId} variant="h3" sx={{ fontSize: 17 }}>
        {title}
      </Typography>
      <Typography color="text.secondary" sx={{ fontSize: 12.5 }}>
        {summary}
        {gaps ? ' Where nothing was measured the line has a gap.' : ''}
      </Typography>
      {children}
    </Box>
  )
}
