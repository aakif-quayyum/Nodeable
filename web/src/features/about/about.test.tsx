import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { Providers } from '../../app/providers.tsx'
import { createQueryClient } from '../../app/queryClient.ts'
import { renderAt } from '../../test/renderApp.tsx'
import { server } from '../../test/server.ts'
import { privateMetrics } from '../../test/statusFixtures.ts'
import { ArchitectureDiagram } from './ArchitectureDiagram.tsx'
import { boxes, edges } from './architecture.ts'

// The chart is ECharts drawing into an element; here the page around it is under test, so a stand-in takes its place.
vi.mock('../../charts/EChart.tsx', async () => {
  const { createElement } = await import('react')
  return { EChart: (props: { label: string }) => createElement('div', { 'data-testid': 'chart', 'aria-label': props.label }) }
})

interface Seen {
  url: URL
  authorization: string | null
}

/** The public metrics are the private ones with everything that is not the crawler's taken out, as the Api does. */
function publicMetrics() {
  const full = privateMetrics()
  return { ...full, series: full.series.filter((s) => !s.id.startsWith('api.') && !s.id.startsWith('preview.')), heatmap: null, slos: null, breaches: null }
}

function servePublic(seen: Seen[], answer: () => Response = () => HttpResponse.json(publicMetrics())) {
  server.use(
    http.get('/api/v1/status/public/metrics', ({ request }) => {
      seen.push({ url: new URL(request.url), authorization: request.headers.get('Authorization') })
      return answer()
    }),
  )
}

// The diagram takes its colours from the theme, so it is drawn inside the app's providers.
function renderDiagram() {
  return render(
    <Providers queryClient={createQueryClient()} graphConnection={null}>
      <ArchitectureDiagram />
    </Providers>,
  )
}

describe('the architecture diagram (FR-ABOUT-01, NFR-A11Y-01, NFR-A11Y-02)', () => {
  it('NFR_A11Y_01 is a named image with a description, and says every connection again as a numbered list', () => {
    renderDiagram()

    const figure = screen.getByRole('img', { name: /How Nodeable is put together/ })
    expect(figure).toHaveAccessibleDescription(/Caddy.*Api.*Worker.*Aspire Dashboard/)
    const list = screen.getByRole('list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(edges.length)
    for (const edge of edges) {
      expect(within(list).getByText(edge.sentence, { exact: false })).toBeInTheDocument()
    }
  })

  it('FR_ABOUT_01 names every part of the system in the figure and numbers every connection', () => {
    const { container } = renderDiagram()
    const text = Array.from(container.querySelectorAll('svg text')).map((node) => node.textContent)

    for (const box of boxes) expect(text).toContain(box.lines[0])
    for (const edge of edges) expect(text).toContain(String(edge.n))
    expect(boxes.map((b) => b.lines[0])).toEqual(
      expect.arrayContaining(['Browser', 'Caddy', 'Api', 'Worker', 'PostgreSQL', 'Redis', 'MusicBrainz', 'Deezer', 'Aspire Dashboard']),
    )
  })

  it('NFR_A11Y_02 tells traces from requests by a dashed line and the list names the kind in words', () => {
    const { container } = renderDiagram()

    expect(container.querySelectorAll('svg path.edge.telemetry')).toHaveLength(edges.filter((e) => e.kind === 'telemetry').length + 1)
    // The legend draws one of each kind besides the connections.
    expect(container.querySelectorAll('svg path.edge:not(.telemetry)')).toHaveLength(edges.filter((e) => e.kind === 'request').length + 1)
    expect(screen.getAllByText('(traces and logs)')).toHaveLength(edges.filter((e) => e.kind === 'telemetry').length)
    expect(screen.getAllByText('(request or data)')).toHaveLength(edges.filter((e) => e.kind === 'request').length)
  })

  it('FR_ABOUT_01 has no Collector and no Grafana: decision 0023 dropped both', () => {
    const { container } = renderDiagram()

    expect(container.textContent).not.toMatch(/collector|grafana/i)
  })
})

describe('the About page (FR-ABOUT-01, NFR-OBS-03)', () => {
  // The panels are a lazy chunk: its first import pays for Vite transforming the modules, which outlasts a wait on a busy machine.
  beforeAll(async () => {
    await import('./CrawlerPanels.tsx')
  })

  it('FR_ABOUT_01 shows the diagram, the live crawler numbers and the links', async () => {
    const seen: Seen[] = []
    servePublic(seen)

    renderAt('/about')

    expect(await screen.findByRole('heading', { level: 1, name: 'About Nodeable' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'How it works' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /How Nodeable is put together/ })).toBeInTheDocument()
    expect(await screen.findByRole('list', { name: 'Current values' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Jobs done and failed' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Oldest job waiting' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Read the code' })).toBeInTheDocument()
  })

  it('FR_ABOUT_01 links to the repository and the spec, opening in a new tab without handing over the opener', async () => {
    servePublic([])
    renderAt('/about')

    const code = await screen.findByRole('link', { name: 'the code on GitHub' })
    const spec = screen.getByRole('link', { name: 'the specification' })

    expect(code).toHaveAttribute('href', 'https://github.com/aakif-quayyum/Nodeable')
    expect(spec).toHaveAttribute('href', 'https://github.com/aakif-quayyum/Nodeable/blob/main/docs/spec/nodeable-spec.md')
    for (const link of [code, spec]) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
  })

  it('NFR_OBS_03 asks for the public metrics with no password and shows only the crawler, never the Api or previews or the objectives', async () => {
    const seen: Seen[] = []
    servePublic(seen)
    renderAt('/about')

    await screen.findByRole('list', { name: 'Current values' })

    expect(seen[0]!.url.pathname).toBe('/api/v1/status/public/metrics')
    expect(seen[0]!.url.searchParams.get('range')).toBe('24h')
    expect(seen.every((s) => s.authorization === null)).toBe(true)
    expect(screen.queryByText('Api requests')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Previews looked up' })).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Service level objectives' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reset zoom' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Refresh' })).not.toBeInTheDocument()
  })

  it('NFR_OBS_03 a different range is asked of the Api', async () => {
    const seen: Seen[] = []
    servePublic(seen)
    renderAt('/about')
    await screen.findByRole('list', { name: 'Current values' })

    await userEvent.click(screen.getByRole('button', { name: '7 days' }))

    await screen.findByText(/Updated/)
    expect(seen.some((s) => s.url.searchParams.get('range') === '7d')).toBe(true)
  })

  it('NFR_A11Y_01 a panel can be read as a table, and a gap says not measured', async () => {
    servePublic([])
    renderAt('/about')
    const panel = (await screen.findByRole('heading', { name: 'Jobs done and failed' })).closest('section')!

    await userEvent.click(within(panel).getByRole('button', { name: 'View as table' }))

    expect(within(within(panel).getByRole('table')).getAllByText('not measured').length).toBeGreaterThan(0)
  })

  it('FR_ABOUT_01 too many requests shows a warning, and the rest of the page is still there', async () => {
    servePublic([], () => new HttpResponse(null, { status: 429 }))
    renderAt('/about')

    expect(await screen.findByText(/Too many requests/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /How Nodeable is put together/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'the specification' })).toBeInTheDocument()
  })

  it('FR_ABOUT_01 an error says so in words and leaves the diagram and the links', async () => {
    servePublic([], () => new HttpResponse(null, { status: 500 }))
    renderAt('/about')

    expect(await screen.findByText(/could not be loaded/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /How Nodeable is put together/ })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Current values' })).not.toBeInTheDocument()
  })
})
