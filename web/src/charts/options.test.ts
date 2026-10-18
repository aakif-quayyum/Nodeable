import { describe, expect, it } from 'vitest'
import { buildPanels } from '../features/status/panels.ts'
import { privateMetrics } from '../test/statusFixtures.ts'
import { lineStyles } from './chartTheme.ts'
import { gaugeOption, heatmapOption, timeSeriesOption } from './options.ts'

const still = { scheme: 'dark', reducedMotion: false } as const

interface LineSeries {
  name: string
  data: [number, number | null][]
  lineStyle: { type: string }
  symbol: string
  connectNulls: boolean
  markLine?: { data: { yAxis?: number; xAxis?: number; label: { show?: boolean; formatter: string } }[] }
}

function build(id: string, annotate = false, reduced = false) {
  const response = privateMetrics()
  const panel = buildPanels(response, true).find((p) => p.spec.id === id)!
  const option = timeSeriesOption(panel.data, panel.spec.thresholds, response, response.breaches ?? [], annotate, { scheme: 'dark', reducedMotion: reduced })
  return { option: option as { series: LineSeries[]; animation: boolean; yAxis: { max?: number }; brush: unknown }, response }
}

describe('chart options (NFR-OBS-03, NFR-A11Y-02, NFR-MOTION-01)', () => {
  it('NFR_OBS_03 a step nobody measured is a null point and the line is not joined across it', () => {
    const { option } = build('jobs')
    const done = option.series.find((s) => s.name === 'Jobs done')!

    expect(done.data.map(([, value]) => value)).toEqual([6, 12, null, 9, 3])
    expect(done.connectNulls).toBe(false)
  })

  it('NFR_A11Y_02 every line of a panel has its own dash and marker as well as its own colour', () => {
    const { option } = build('mb')
    const keys = option.series.map((s) => `${s.lineStyle.type}/${s.symbol}`)

    expect(new Set(keys).size).toBe(option.series.length)
    expect(lineStyles.length).toBeGreaterThanOrEqual(4)
  })

  it('NFR_OBS_03 an objective limit is a dashed line at its value and a ratio axis stops at 100 percent', () => {
    const { option } = build('mb503')
    const marks = option.series[0]!.markLine!.data

    expect(marks.find((m) => m.yAxis === 0.01)!.label.formatter).toBe('1% limit')
    expect(option.yAxis.max).toBe(1)
  })

  it('NFR_OBS_03 a breach is a vertical marker at its time, labelled only on the panel that asks for the text', () => {
    const labelled = build('jobs', true).option.series[0]!.markLine!.data.find((m) => m.xAxis !== undefined)!
    const quiet = build('queue', false).option.series[0]!.markLine!.data.find((m) => m.xAxis !== undefined)!

    expect(labelled.xAxis).toBe(Date.parse('2026-10-12T12:03:00Z'))
    expect(labelled.label.show).toBe(true)
    expect(labelled.label.formatter).toBe('Cached graph load (under 300 ms) 90%, target 95%')
    expect(quiet.label.show).toBe(false)
  })

  it('NFR_MOTION_01 with reduced motion no chart animates', () => {
    const response = privateMetrics()
    const heatmap = response.heatmap!

    expect(build('jobs', false, true).option.animation).toBe(false)
    expect(build('jobs', false, false).option.animation).toBe(true)
    expect(heatmapOption(response, heatmap.bounds, heatmap.cells, { scheme: 'dark', reducedMotion: true })).toMatchObject({ animation: false })
    expect(gaugeOption(10, { scheme: 'dark', reducedMotion: true })).toMatchObject({ animation: false })
    expect(gaugeOption(10, still)).toMatchObject({ animation: true })
  })

  it('NFR_OBS_03 drag-to-zoom is on for a time-series panel', () => {
    expect(build('jobs').option.brush).toMatchObject({ xAxisIndex: 0, brushType: 'lineX' })
  })

  it('NFR_OBS_03 the heatmap puts each cell at its time and bound and the gauge hides its needle when unmeasured', () => {
    const response = privateMetrics()
    const option = heatmapOption(response, response.heatmap!.bounds, response.heatmap!.cells, still) as { series: { data: number[][] }[]; yAxis: { data: string[] } }
    const gauge = gaugeOption(null, still) as { series: { pointer: { show: boolean } }[] }

    expect(option.series[0]!.data).toEqual(response.heatmap!.cells)
    expect(option.yAxis.data.at(-1)).toBe('over 5 s')
    expect(gauge.series[0]!.pointer.show).toBe(false)
  })
})
