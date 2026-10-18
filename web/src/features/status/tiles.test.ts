import { describe, expect, it } from 'vitest'
import { privateMetrics, series } from '../../test/statusFixtures.ts'
import { buildPanels } from './panels.ts'
import { buildTiles } from './tiles.ts'

describe('stat tiles and panels (NFR-OBS-03)', () => {
  it('NFR_OBS_03 a tile adds its series step by step and reads the newest complete step', () => {
    const tiles = buildTiles(privateMetrics(), true)
    const mb = tiles.find((t) => t.id === 'mb')!

    // 5 + 0 + 0 + 0, 5 + 0 + 1 + 0, a step nobody measured, 4, and the step still filling: 1.
    expect(mb.points).toEqual([5, 6, null, 4, 1])
    expect(mb.value).toBe(4)
  })

  it('NFR_OBS_03 a sampled tile such as the queue shows the newest sample, even in the last step', () => {
    const tiles = buildTiles(privateMetrics(), true)

    expect(tiles.find((t) => t.id === 'queue')!.value).toBe(0)
    expect(tiles.find((t) => t.id === 'oldest')!.value).toBe(0)
  })

  it('NFR_OBS_03 a tile whose every step was unmeasured has no value', () => {
    const response = privateMetrics({ series: [series('jobs.done', 'Jobs done', [null, null, null, null, null])] })

    expect(buildTiles(response, true).find((t) => t.id === 'done')!.value).toBeNull()
  })

  it('FR_ABOUT_01 the public set has no Api or preview tiles and no Api or preview panels', () => {
    const tiles = buildTiles(privateMetrics(), false).map((t) => t.id)
    const panels = buildPanels(privateMetrics(), false).map((p) => p.spec.id)

    expect(tiles).not.toContain('api')
    expect(tiles).not.toContain('errors')
    expect(tiles).toContain('queue')
    expect(panels).not.toContain('api')
    expect(panels).not.toContain('previews')
    expect(panels).toContain('jobs')
  })

  it('NFR_OBS_03 a panel leaves out a series the Api did not send and is dropped when none of its series came', () => {
    const response = privateMetrics({ series: [series('jobs.done', 'Jobs done', [1, 2, 3, 4, 5])] })

    const panels = buildPanels(response, true)

    expect(panels.map((p) => p.spec.id)).toEqual(['jobs'])
    expect(panels[0]!.data.series.map((s) => s.id)).toEqual(['jobs.done'])
  })

  it('NFR_OBS_03 counts in a panel are shown per minute of the step', () => {
    const response = privateMetrics({ stepSeconds: 300, series: [series('jobs.done', 'Jobs done', [300, null])] })

    expect(buildPanels(response, true)[0]!.data.series[0]!.points).toEqual([60, null])
  })
})
