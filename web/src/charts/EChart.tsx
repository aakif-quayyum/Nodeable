import Box from '@mui/material/Box'
import type { EChartsCoreOption, EChartsType } from 'echarts/core'
import { useEffect, useRef, useState } from 'react'
import { buildChartTheme, chartThemeName } from './chartTheme.ts'
import { echarts } from './echartsSetup.ts'
import { useChartScheme } from './useChartScheme.ts'

// The themes are registered once, for both schemes; a chart picks one by name when it is created.
echarts.registerTheme(chartThemeName('dark'), buildChartTheme('dark'))
echarts.registerTheme(chartThemeName('light'), buildChartTheme('light'))

interface EChartProps {
  option: EChartsCoreOption
  height: number
  /** What the chart shows, for a screen reader: the panel's text summary is read with it. */
  label: string
  /** Charts in the same group share one crosshair (echarts.connect). */
  group?: string
  /** Called with the start and end (milliseconds) of a range dragged across the chart. Turns drag-to-zoom on. */
  onBrushEnd?: (fromMs: number, toMs: number) => void
}

/**
 * A thin wrapper of Apache ECharts (decision 0023): it creates the chart when the component mounts, applies a new option
 * when the data changes, resizes with the container, and disposes on unmount. ECharts is imperative, so React owns the
 * container and ECharts owns what is drawn inside it.
 */
export function EChart({ option, height, label, group, onBrushEnd }: EChartProps) {
  const container = useRef<HTMLDivElement>(null)
  const [chart, setChart] = useState<EChartsType | null>(null)
  const scheme = useChartScheme()

  // The handler is read through a ref, so changing it never recreates the chart.
  const brushEnd = useRef(onBrushEnd)
  useEffect(() => {
    brushEnd.current = onBrushEnd
  })

  // LEARN: LG-04 echarts-lifecycle | ECharts draws into an element it is given and keeps its own state, so the wrapper creates it in an effect, hands React a handle through state, and disposes it in the cleanup; the theme is chosen at creation, so a change of colour scheme creates the chart again
  useEffect(() => {
    const element = container.current
    if (element === null) return undefined

    // jsdom, and a hidden tab, give a container no size: ECharts needs a number, so it gets a sensible one.
    const created = echarts.init(element, chartThemeName(scheme), { renderer: 'svg', width: element.clientWidth || 640, height })
    if (group !== undefined) {
      created.group = group
      echarts.connect(group)
    }

    if (brushEnd.current !== undefined) {
      created.on('brushEnd', (event) => {
        const range = (event as { areas?: { coordRange?: [number, number] }[] }).areas?.[0]?.coordRange
        created.dispatchAction({ type: 'brush', areas: [] })
        if (range !== undefined) brushEnd.current?.(range[0], range[1])
      })
    }

    // Where there is no ResizeObserver (jsdom) the chart keeps the size it was created with, as the orbit does.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      if (element.clientWidth > 0) created.resize({ width: element.clientWidth, height })
    })
    observer?.observe(element)
    setChart(created)

    return () => {
      observer?.disconnect()
      created.dispose()
      setChart(null)
    }
  }, [scheme, group, height])

  useEffect(() => {
    // notMerge: a new answer replaces the old series, so a series that disappeared does not linger.
    chart?.setOption(option, { notMerge: true })
    // Dragging across the chart draws a band straight away, without picking a tool first. The brush exists only once an
    // option has been applied, so the cursor is taken after it, every time the option is replaced.
    if (chart !== null && brushEnd.current !== undefined) {
      chart.dispatchAction({ type: 'takeGlobalCursor', key: 'brush', brushOption: { brushType: 'lineX', brushMode: 'single' } })
    }
  }, [chart, option])

  return <Box ref={container} role="img" aria-label={label} sx={{ width: '100%', height }} />
}
