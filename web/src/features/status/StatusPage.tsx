import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useChartScheme } from '../../charts/useChartScheme.ts'
import { timeSeriesOption } from '../../charts/options.ts'
import { useReducedMotion } from '../../motion/useReducedMotion.ts'
import { ChartPanel } from './ChartPanel.tsx'
import { buildPanels } from './panels.ts'
import { SignIn } from './SignIn.tsx'
import { SloStrip } from './SloStrip.tsx'
import { LatencyHeatmap, QueueGauge } from './SpecialPanels.tsx'
import { StatTile } from './StatTile.tsx'
import { fetchPrivateMetrics, StatusRequestError } from './statusApi.ts'
import { StatusControls } from './StatusControls.tsx'
import { type MetricsResponse, type Range, rangeLabels, seriesOf, type ZoomWindow, zoomFromBrush } from './statusModel.ts'
import { buildTiles } from './tiles.ts'
import { useContainerWidth, widthFor } from './useChartWidth.ts'

/** Charts in this group share one crosshair (echarts.connect). */
const crosshairGroup = 'status-panels'

/**
 * The operator's status page (NFR-OBS-03, decision 0023): the rollup drawn as stat tiles and time-series panels with a
 * shared crosshair and drag-to-zoom, the objectives' limits and breaches marked, a heatmap of MusicBrainz response times and
 * a gauge for the queue. The page holds no data of its own: every number comes from the private metrics endpoint, which the
 * operator password opens.
 */
export function Component() {
  const queryClient = useQueryClient()
  const scheme = useChartScheme()
  const reducedMotion = useReducedMotion()

  // The password lives in this component's memory and nowhere else: not in storage, not in the query key.
  const passwordRef = useRef<string | null>(null)
  const [signedIn, setSignedIn] = useState(false)
  const [rejected, setRejected] = useState(false)

  const [range, setRange] = useState<Range>('24h')
  const [refreshMs, setRefreshMs] = useState(30_000)
  const [zoom, setZoom] = useState<ZoomWindow | null>(null)
  const { ref: gridRef, pixels } = useContainerWidth()
  const width = widthFor(pixels)

  const metrics = useQuery({
    queryKey: ['status', 'private', range, zoom?.from ?? null, zoom?.to ?? null, width],
    queryFn: async ({ signal }) => {
      try {
        return await fetchPrivateMetrics(passwordRef.current ?? '', { range, zoom, width }, signal)
      } catch (error) {
        // A refused password sends the person back to the form; the page never keeps a password the Api turned down.
        if (error instanceof StatusRequestError && error.status === 401) {
          passwordRef.current = null
          setSignedIn(false)
          setRejected(true)
        }
        throw error
      }
    },
    enabled: signedIn,
    retry: false,
    placeholderData: keepPreviousData,
    // A zoomed window is a fixed past window: reading it again would show the same numbers.
    refetchInterval: refreshMs > 0 && zoom === null ? refreshMs : false,
  })

  const signOut = useCallback(() => {
    passwordRef.current = null
    setSignedIn(false)
    queryClient.removeQueries({ queryKey: ['status'] })
  }, [queryClient])

  const onBrushEnd = useCallback((fromMs: number, toMs: number) => {
    const next = zoomFromBrush(fromMs, toMs)
    if (next !== null) setZoom(next)
  }, [])

  const data: MetricsResponse | undefined = metrics.data
  const panels = useMemo(() => (data === undefined ? [] : buildPanels(data, true)), [data])
  const tiles = useMemo(() => (data === undefined ? [] : buildTiles(data, true)), [data])
  const rangeText = zoom === null ? `the last ${rangeLabels[range]}` : 'the selected window'

  if (!signedIn) {
    return (
      <>
        <Typography variant="h1" gutterBottom>
          Status
        </Typography>
        <SignIn
          problem={rejected ? 'rejected' : null}
          onSubmit={(password) => {
            passwordRef.current = password
            setRejected(false)
            setSignedIn(true)
          }}
        />
      </>
    )
  }

  const limited = metrics.error instanceof StatusRequestError && metrics.error.status === 429

  return (
    <>
      <Typography variant="h1" gutterBottom>
        Status
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2.5 }}>
        <StatusControls
          range={range}
          onRange={(next) => {
            setZoom(null)
            setRange(next)
          }}
          refreshMs={refreshMs}
          onRefresh={setRefreshMs}
          zoomed={zoom !== null}
          onResetZoom={() => setZoom(null)}
          updatedAt={metrics.dataUpdatedAt === 0 ? null : metrics.dataUpdatedAt}
          onSignOut={signOut}
        />

        {limited && <Alert severity="warning">Too many requests. The page will show new numbers when the limit lifts; wait a minute.</Alert>}
        {metrics.isError && !limited && <Alert severity="error">The numbers could not be loaded. Try again in a moment.</Alert>}

        <Box ref={gridRef} sx={{ minWidth: 0 }}>
          {data === undefined ? (
            <Skeleton variant="rounded" height={320} aria-label="Loading the numbers" />
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2.5 }} aria-busy={metrics.isFetching}>
              <Box component="ul" aria-label="Current values" sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(5, minmax(0, 1fr))' }, gap: 1, m: 0, p: 0 }}>
                {tiles.map((tile) => (
                  <StatTile key={tile.id} tile={tile} />
                ))}
              </Box>

              <Typography variant="h2" sx={{ fontSize: 20 }}>
                Service level objectives
              </Typography>
              {data.slos !== null && <SloStrip slos={data.slos} />}

              <Typography variant="h2" sx={{ fontSize: 20 }}>
                Over time
              </Typography>
              <Typography color="text.secondary" sx={{ fontSize: 13, mt: -1.5 }}>
                Drag across any chart to zoom all of them in on that window. Dotted vertical lines mark an objective the daily check found breached.
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
                {panels.map(({ spec, data: panel }, index) => (
                  <ChartPanel
                    key={spec.id}
                    panel={panel}
                    times={data.times}
                    rangeText={rangeText}
                    group={crosshairGroup}
                    onBrushEnd={onBrushEnd}
                    option={timeSeriesOption(panel, spec.thresholds, data, data.breaches ?? [], index === 0, { scheme, reducedMotion })}
                  />
                ))}
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 2fr) minmax(0, 1fr)' }, gap: 2 }}>
                {data.heatmap !== null && <LatencyHeatmap response={data} heatmap={data.heatmap} />}
                <QueueGauge seconds={tiles.find((tile) => tile.id === 'oldest')?.value ?? lastValue(seriesOf(data, 'queue.oldest_pending').points)} />
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </>
  )
}

function lastValue(points: readonly (number | null)[]): number | null {
  for (let i = points.length - 1; i >= 0; i--) {
    const value = points[i]
    if (value !== null && value !== undefined) return value
  }
  return null
}
