import type { components } from '../../api/schema'

export type MetricsResponse = components['schemas']['MetricsResponse']
export type MetricSeries = components['schemas']['MetricSeries']
export type SloStatus = components['schemas']['SloStatus']
export type SloBreach = components['schemas']['SloBreach']

/** What a panel's points mean once they are shown: counts become a rate per minute, ratios a percentage. */
export type Unit = 'perMinute' | 'ratio' | 'jobs' | 'seconds'

export const ranges = ['1h', '6h', '24h', '7d'] as const
export type Range = (typeof ranges)[number]

export const rangeLabels: Record<Range, string> = { '1h': '1 hour', '6h': '6 hours', '24h': '24 hours', '7d': '7 days' }

/** A window the person dragged out on a chart (drag-to-zoom). It replaces the range until it is reset. */
export interface ZoomWindow {
  from: string
  to: string
}

/** The shortest window a drag may select: two minutes is the narrowest the 1-minute rows can show as a line. */
export const minZoomMs = 2 * 60 * 1000

export function zoomFromBrush(fromMs: number, toMs: number): ZoomWindow | null {
  const [start, end] = fromMs <= toMs ? [fromMs, toMs] : [toMs, fromMs]
  if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < minZoomMs) return null
  return { from: new Date(start).toISOString(), to: new Date(end).toISOString() }
}

/** A series by id, or an all-null one so a panel never has to ask whether the Api sent it. */
export function seriesOf(response: MetricsResponse, id: string): MetricSeries {
  return response.series.find((s) => s.id === id) ?? { id, label: id, unit: 'count', points: response.times.map(() => null) }
}

/** The points of a series as they are shown: counts per step become per minute, and a gap stays a gap. */
export function shownPoints(series: MetricSeries, stepSeconds: number, unit: Unit): (number | null)[] {
  if (unit !== 'perMinute') return series.points
  const perMinute = 60 / stepSeconds
  return series.points.map((p) => (p === null ? null : p * perMinute))
}

/**
 * The newest value that is complete. The last step is still filling (the current minute is not over), so it is skipped:
 * showing it would make every rate dip to nearly zero at the right edge.
 */
export function latestComplete(points: readonly (number | null)[]): number | null {
  for (let i = points.length - 2; i >= 0; i--) {
    const value = points[i]
    if (value !== null && value !== undefined) return value
  }
  return null
}

export function peak(points: readonly (number | null)[]): number | null {
  let best: number | null = null
  for (const p of points) if (p !== null && (best === null || p > best)) best = p
  return best
}

const number = new Intl.NumberFormat('en', { maximumFractionDigits: 1 })

export function formatSeconds(seconds: number): string {
  if (seconds < 90) return `${Math.round(seconds)} s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes} min ${Math.round(seconds - minutes * 60)} s`
}

/** The words for a value; null is "not measured", never a number (spec principle 5). */
export function formatValue(unit: Unit, value: number | null): string {
  if (value === null) return 'not measured'
  switch (unit) {
    case 'ratio':
      return `${number.format(value * 100)}%`
    case 'perMinute':
      return `${number.format(value)} per minute`
    case 'seconds':
      return formatSeconds(value)
    case 'jobs':
      return `${number.format(value)} ${value === 1 ? 'job' : 'jobs'}`
  }
}

export interface PanelData {
  id: string
  title: string
  unit: Unit
  series: { id: string; label: string; points: (number | null)[] }[]
}

/** The wording of a band of the queue gauge, so its colours are also said in words. */
export function freshnessBand(seconds: number | null): string {
  if (seconds === null) return 'Not measured.'
  if (seconds <= 300) return 'Well inside the 10-minute limit.'
  if (seconds <= 600) return 'Getting close to the 10-minute limit.'
  return 'Past the 10-minute limit.'
}

/** How often the numbers are read again, in milliseconds; 0 is never. */
export const refreshChoices = [
  { ms: 0, label: 'Off' },
  { ms: 10_000, label: '10 seconds' },
  { ms: 30_000, label: '30 seconds' },
  { ms: 60_000, label: '1 minute' },
] as const

/** One sentence a screen reader can use in place of the chart: what each line is now and how high it went. */
export function summarise(panel: PanelData, rangeText: string): string {
  const parts = panel.series.map((s) => {
    const now = latestComplete(s.points)
    const high = peak(s.points)
    return now === null && high === null
      ? `${s.label}: not measured in this window`
      : `${s.label}: ${formatValue(panel.unit, now)} now, highest ${formatValue(panel.unit, high)}`
  })
  return `${panel.title} over ${rangeText}. ${parts.join('. ')}.`
}

/** The same numbers as the chart, as table rows: a time and one cell for each series. */
export function tableRows(times: readonly string[], panel: PanelData): { time: string; cells: string[] }[] {
  return times.map((time, i) => ({ time, cells: panel.series.map((s) => formatValue(panel.unit, s.points[i] ?? null)) }))
}

/** True when anything in the panel was not measured, so the summary can say there are gaps. */
export function hasGaps(panel: PanelData): boolean {
  return panel.series.some((s) => s.points.some((p) => p === null))
}
