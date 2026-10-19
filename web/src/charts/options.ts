import type { EChartsCoreOption } from 'echarts/core'
import { creditRoleStyles } from '../app/creditRoles.ts'
import { fontFamilies, tokens } from '../app/tokens.ts'
import type { Threshold } from '../features/status/panels.ts'
import { formatSeconds, formatValue, type MetricsResponse, type PanelData, type SloBreach } from '../features/status/statusModel.ts'
import { type ChartScheme, lineStyles, seriesColors } from './chartTheme.ts'

interface Common {
  scheme: ChartScheme
  /** True when the person asked for less motion (NFR-MOTION-01): no animation is drawn. */
  reducedMotion: boolean
}

const gridBox = { left: 56, right: 18, top: 34, bottom: 26 }

function axisPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

/**
 * The option for a time-series panel (NFR-OBS-03). A missing point stays a gap (connectNulls is false): unmeasured is
 * not zero. Each line has its own colour, dash and marker (NFR-A11Y-02); a limit is a dashed horizontal line, and a
 * breach the daily check recorded is a dotted vertical one, labelled on the panel that asks for it.
 */
export function timeSeriesOption(
  panel: PanelData,
  thresholds: Threshold[] | undefined,
  response: MetricsResponse,
  breaches: SloBreach[],
  annotate: boolean,
  { scheme, reducedMotion }: Common,
): EChartsCoreOption {
  const colors = seriesColors(scheme)
  const t = tokens[scheme]
  const times = response.times.map((time) => Date.parse(time))

  const lines = (thresholds ?? []).map((threshold) => ({
    yAxis: threshold.value,
    label: { formatter: threshold.label, position: 'insideEndTop', color: t.fg },
    lineStyle: { type: 'dashed', color: t.accent, width: 1.5 },
  }))
  const marks = breaches.map((breach) => ({
    xAxis: Date.parse(breach.at),
    label: { show: annotate, formatter: breach.text, position: 'insideEndTop', color: t.fg, backgroundColor: t.panel2, padding: 3 },
    lineStyle: { type: 'dotted', color: creditRoleStyles.songwriter.colors[scheme], width: 2 },
  }))

  return {
    animation: !reducedMotion,
    grid: gridBox,
    legend: { top: 0, left: 0, data: panel.series.map((s) => s.label) },
    tooltip: {
      trigger: 'axis',
      confine: true,
      valueFormatter: (value: unknown) => formatValue(panel.unit, typeof value === 'number' ? value : null),
    },
    xAxis: { type: 'time', min: Date.parse(response.from), max: Date.parse(response.to) },
    yAxis: {
      type: 'value',
      min: 0,
      max: panel.unit === 'ratio' ? 1 : undefined,
      axisLabel: { formatter: panel.unit === 'ratio' ? axisPercent : undefined },
      minInterval: panel.unit === 'jobs' ? 1 : undefined,
    },
    brush: { xAxisIndex: 0, brushType: 'lineX', brushMode: 'single', transformable: false, brushStyle: { color: `${t.accent}33`, borderColor: t.accent } },
    series: panel.series.map((s, i) => ({
      type: 'line',
      name: s.label,
      data: times.map((time, j) => [time, s.points[j] ?? null]),
      connectNulls: false,
      symbol: lineStyles[i % lineStyles.length]!.symbol,
      symbolSize: 6,
      showAllSymbol: 'auto',
      lineStyle: { type: lineStyles[i % lineStyles.length]!.type, width: 2, color: colors[i % colors.length] },
      itemStyle: { color: colors[i % colors.length] },
      emphasis: { focus: 'series' },
      markLine: i === 0 && (lines.length > 0 || marks.length > 0) ? { silent: true, symbol: 'none', data: [...lines, ...marks] } : undefined,
    })),
  }
}

/** The MusicBrainz latency heatmap: time across, response-time bound up, darker for more requests. */
export function heatmapOption(response: MetricsResponse, bounds: string[], cells: number[][], { scheme, reducedMotion }: Common): EChartsCoreOption {
  const t = tokens[scheme]
  const hours = new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit', hour12: false })
  const labels = response.times.map((time) => hours.format(new Date(time)))
  const boundLabels = bounds.map((bound, i) => (bound === 'inf' ? `over ${bounds[i - 1] ?? '0'} s` : `up to ${bound} s`))
  const most = cells.reduce((m, c) => Math.max(m, c[2] ?? 0), 1)

  return {
    animation: !reducedMotion,
    grid: { left: 104, right: 18, top: 12, bottom: 64 },
    tooltip: {
      confine: true,
      formatter: (params: unknown) => {
        const [x, y, count] = (params as { value: number[] }).value
        return `${labels[x ?? 0]}, ${boundLabels[y ?? 0]}: ${count} ${count === 1 ? 'request' : 'requests'}`
      },
    },
    xAxis: { type: 'category', data: labels, splitArea: { show: false }, axisLabel: { interval: 'auto' } },
    yAxis: { type: 'category', data: boundLabels, axisLabel: { fontFamily: fontFamilies.mono } },
    visualMap: { min: 0, max: most, calculable: false, orient: 'horizontal', left: 'center', bottom: 4, inRange: { color: [t.panel2, t.accent] }, text: ['more', 'fewer'] },
    series: [{ type: 'heatmap', data: cells, itemStyle: { borderColor: t.bg, borderWidth: 1 }, emphasis: { itemStyle: { borderColor: t.fg } } }],
  }
}

/** Seconds the oldest ready job has waited, with the freshness limit (600 s) as the edge of the last good band. */
export function gaugeOption(seconds: number | null, { scheme, reducedMotion }: Common): EChartsCoreOption {
  const t = tokens[scheme]
  const max = 900
  return {
    animation: !reducedMotion,
    series: [
      {
        type: 'gauge',
        min: 0,
        max,
        startAngle: 200,
        endAngle: -20,
        axisLine: { lineStyle: { width: 14, color: [[300 / max, t.ok], [600 / max, t.accent], [1, creditRoleStyles.songwriter.colors[scheme]]] } },
        pointer: { show: seconds !== null, width: 5, itemStyle: { color: t.fg } },
        axisTick: { show: false },
        splitLine: { length: 14, lineStyle: { color: t.bg, width: 2 } },
        axisLabel: { distance: 20, color: t.muted, formatter: (value: number) => (value % 300 === 0 ? (value === 0 ? '0' : `${value / 60} min`) : '') },
        detail: { valueAnimation: false, offsetCenter: [0, '60%'], fontSize: 18, color: t.fg, formatter: () => (seconds === null ? 'not measured' : formatSeconds(seconds)) },
        data: [{ value: seconds ?? 0 }],
      },
    ],
  }
}
