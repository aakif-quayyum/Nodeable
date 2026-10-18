import { describe, expect, it } from 'vitest'
import { fixtureTimes, privateMetrics, series } from '../../test/statusFixtures.ts'
import { basicAuthorization } from './statusApi.ts'
import {
  formatSeconds,
  formatValue,
  freshnessBand,
  hasGaps,
  latestComplete,
  minZoomMs,
  type PanelData,
  peak,
  seriesOf,
  shownPoints,
  summarise,
  tableRows,
  zoomFromBrush,
} from './statusModel.ts'

describe('the status page model (NFR-OBS-03)', () => {
  it('NFR_OBS_03 a dragged range becomes a window, in either direction, and a drag that is too short is ignored', () => {
    const start = Date.parse('2026-10-12T10:00:00Z')

    expect(zoomFromBrush(start, start + 10 * 60_000)).toEqual({ from: '2026-10-12T10:00:00.000Z', to: '2026-10-12T10:10:00.000Z' })
    expect(zoomFromBrush(start + 10 * 60_000, start)).toEqual({ from: '2026-10-12T10:00:00.000Z', to: '2026-10-12T10:10:00.000Z' })
    expect(zoomFromBrush(start, start + minZoomMs - 1)).toBeNull()
    expect(zoomFromBrush(Number.NaN, start)).toBeNull()
  })

  it('NFR_OBS_03 counts are shown per minute whatever the step and a gap stays a gap', () => {
    const counts = series('jobs.done', 'Jobs done', [60, null, 0])

    expect(shownPoints(counts, 300, 'perMinute')).toEqual([12, null, 0])
    expect(shownPoints(counts, 60, 'ratio')).toEqual([60, null, 0])
  })

  it('NFR_OBS_03 the newest value skips the step that is still filling and a series that is missing reads as all gaps', () => {
    expect(latestComplete([1, 2, 3])).toBe(2)
    expect(latestComplete([1, null, 3])).toBe(1)
    expect(latestComplete([null, null, 3])).toBeNull()
    expect(latestComplete([5])).toBeNull()

    const missing = seriesOf(privateMetrics(), 'no.such.series')
    expect(missing.points).toEqual([null, null, null, null, null])
  })

  it('NFR_OBS_03 a value is said in words and an unmeasured one is said to be unmeasured, never as zero', () => {
    expect(formatValue('ratio', 0.1234)).toBe('12.3%')
    expect(formatValue('perMinute', 2.5)).toBe('2.5 per minute')
    expect(formatValue('jobs', 1)).toBe('1 job')
    expect(formatValue('jobs', 0)).toBe('0 jobs')
    expect(formatValue('seconds', 45)).toBe('45 s')
    expect(formatValue('seconds', 150)).toBe('2 min 30 s')
    expect(formatValue('ratio', null)).toBe('not measured')
    expect(formatSeconds(0)).toBe('0 s')
  })

  it('NFR_A11Y_01 a panel has a one-sentence summary and the same numbers as a table, with gaps shown as not measured', () => {
    const panel: PanelData = {
      id: 'jobs',
      title: 'Jobs done and failed',
      unit: 'perMinute',
      series: [
        { id: 'jobs.done', label: 'Jobs done', points: [6, 12, null, 9, 3] },
        { id: 'jobs.failed', label: 'Jobs failed', points: [0, 1, null, 0, 0] },
      ],
    }

    expect(summarise(panel, 'the last 24 hours')).toBe(
      'Jobs done and failed over the last 24 hours. Jobs done: 9 per minute now, highest 12 per minute. Jobs failed: 0 per minute now, highest 1 per minute.',
    )
    expect(hasGaps(panel)).toBe(true)
    const rows = tableRows(fixtureTimes, panel)
    expect(rows).toHaveLength(5)
    expect(rows[2]!.cells).toEqual(['not measured', 'not measured'])
    expect(rows[1]!.cells).toEqual(['12 per minute', '1 per minute'])
    expect(peak([null, null])).toBeNull()
  })

  it('NFR_A11Y_02 the gauge colours are also said in words', () => {
    expect(freshnessBand(100)).toMatch(/Well inside/)
    expect(freshnessBand(450)).toMatch(/close to/)
    expect(freshnessBand(700)).toMatch(/Past/)
    expect(freshnessBand(null)).toBe('Not measured.')
  })

  it('NFR_OBS_03 the operator header is HTTP Basic over UTF-8, so accents and symbols in a password survive', () => {
    expect(basicAuthorization('pass')).toBe('Basic b3BlcmF0b3I6cGFzcw==')
    const decoded = Buffer.from(basicAuthorization('pässwörd:€').slice('Basic '.length), 'base64').toString('utf8')
    expect(decoded).toBe('operator:pässwörd:€')
  })
})
