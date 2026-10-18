import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Providers } from '../app/providers.tsx'
import { createQueryClient } from '../app/queryClient.ts'
import { buildPanels } from '../features/status/panels.ts'
import { privateMetrics } from '../test/statusFixtures.ts'
import { EChart } from './EChart.tsx'
import { timeSeriesOption } from './options.ts'

// ECharts really draws here (the SVG renderer makes marks that jsdom can hold), so the wrapper's lifecycle and the options
// are checked against the library and not a stand-in.
describe('the chart wrapper (NFR-OBS-03, NFR-A11Y-01)', () => {
  function drawn() {
    const response = privateMetrics()
    const panel = buildPanels(response, true).find((p) => p.spec.id === 'jobs')!
    return timeSeriesOption(panel.data, panel.spec.thresholds, response, [], false, { scheme: 'dark', reducedMotion: true })
  }

  it('NFR_A11Y_01 draws an svg inside a container that is named for a screen reader', () => {
    const { container, getByRole } = render(
      <Providers queryClient={createQueryClient()} graphConnection={null}>
        <EChart option={drawn()} height={200} label="Jobs done and failed over the last 24 hours." />
      </Providers>,
    )

    expect(getByRole('img', { name: 'Jobs done and failed over the last 24 hours.' })).toBeInTheDocument()
    expect(container.querySelector('svg')).not.toBeNull()
    expect(container.querySelectorAll('svg path').length).toBeGreaterThan(0)
  })

  it('NFR_OBS_03 takes a new option, and disposes the chart when it goes away', () => {
    const { container, rerender, unmount } = render(
      <Providers queryClient={createQueryClient()} graphConnection={null}>
        <EChart option={drawn()} height={200} label="first" />
      </Providers>,
    )
    const before = container.querySelector('svg')?.innerHTML.length ?? 0

    rerender(
      <Providers queryClient={createQueryClient()} graphConnection={null}>
        <EChart option={{ ...drawn(), series: [] }} height={200} label="second" />
      </Providers>,
    )

    expect(container.querySelector('svg')?.innerHTML.length ?? 0).toBeLessThan(before)
    unmount()
    expect(container.querySelector('svg')).toBeNull()
  })
})
