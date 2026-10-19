import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { timeSeriesOption } from '../../charts/options.ts'
import { useChartScheme } from '../../charts/useChartScheme.ts'
import { useReducedMotion } from '../../motion/useReducedMotion.ts'
import { ChartPanel } from '../status/ChartPanel.tsx'
import { buildPanels } from '../status/panels.ts'
import { RangeToggle } from '../status/RangeToggle.tsx'
import { QueueGauge } from '../status/SpecialPanels.tsx'
import { StatTile } from '../status/StatTile.tsx'
import { fetchPublicMetrics, StatusRequestError } from '../status/statusApi.ts'
import { type Range, rangeLabels } from '../status/statusModel.ts'
import { buildTiles } from '../status/tiles.ts'
import { useContainerWidth, widthFor } from '../status/useChartWidth.ts'

/** Charts in this group share one crosshair (echarts.connect). */
const crosshairGroup = 'about-panels'

/** The crawler's numbers read again this often, without a control: this page is for reading, not for operating. */
const refreshMs = 60_000

/**
 * The live crawl panel of the About page (FR-ABOUT-01, NFR-OBS-03): the same tiles, panels and gauge as the status page,
 * from the public metrics, which hold the crawler's numbers and nothing else. No password is asked for and none is sent.
 */
export function CrawlerPanels() {
  const [range, setRange] = useState<Range>('24h')
  const { ref, pixels } = useContainerWidth()
  const width = widthFor(pixels)
  const scheme = useChartScheme()
  const reducedMotion = useReducedMotion()

  const metrics = useQuery({
    queryKey: ['status', 'public', range, width],
    queryFn: ({ signal }) => fetchPublicMetrics(range, width, signal),
    retry: false,
    placeholderData: keepPreviousData,
    refetchInterval: refreshMs,
  })

  const data = metrics.data
  const tiles = useMemo(() => (data === undefined ? [] : buildTiles(data, false)), [data])
  const panels = useMemo(() => (data === undefined ? [] : buildPanels(data, false)), [data])
  const limited = metrics.error instanceof StatusRequestError && metrics.error.status === 429

  return (
    <Box ref={ref} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2.5, minWidth: 0 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
        <RangeToggle value={range} onChange={setRange} />
        <Typography color="text.secondary" sx={{ fontSize: 13 }} aria-live="polite">
          {metrics.dataUpdatedAt === 0 ? '' : `Updated ${new Date(metrics.dataUpdatedAt).toLocaleTimeString()}, then every minute`}
        </Typography>
      </Box>

      <Typography color="text.secondary" sx={{ fontSize: 13.5 }}>
        These numbers are counted by Nodeable itself and added up once a minute. Where nothing was measured, a chart has a gap or a tile
        says &ldquo;not measured&rdquo;; that is different from zero.
      </Typography>

      {limited && <Alert severity="warning">Too many requests. The numbers will show again in a minute.</Alert>}
      {metrics.isError && !limited && <Alert severity="error">The crawler&apos;s numbers could not be loaded. Try again in a moment.</Alert>}

      {data === undefined ? (
        !metrics.isError && <Skeleton variant="rounded" height={260} aria-label="Loading the crawler's numbers" />
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2.5 }} aria-busy={metrics.isFetching}>
          <Box component="ul" aria-label="Current values" sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1, m: 0, p: 0 }}>
            {tiles.map((tile) => (
              <StatTile key={tile.id} tile={tile} />
            ))}
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
            {panels.map(({ spec, data: panel }) => (
              <ChartPanel
                key={spec.id}
                panel={panel}
                times={data.times}
                rangeText={`the last ${rangeLabels[range]}`}
                group={crosshairGroup}
                option={timeSeriesOption(panel, spec.thresholds, data, [], false, { scheme, reducedMotion })}
              />
            ))}
            <QueueGauge seconds={tiles.find((tile) => tile.id === 'oldest')?.value ?? null} />
          </Box>
        </Box>
      )}
    </Box>
  )
}
