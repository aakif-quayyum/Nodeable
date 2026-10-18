import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { renderAt } from '../../test/renderApp.tsx'
import { server } from '../../test/server.ts'
import { preloadStatusPage } from '../../test/lazyChunks.ts'
import { privateMetrics } from '../../test/statusFixtures.ts'
import { basicAuthorization } from './statusApi.ts'

// The chart itself is ECharts drawing into an element; what is under test here is the page around it. The stand-in has one
// button that does what a drag across a chart does, so the zoom can be exercised without a browser.
vi.mock('../../charts/EChart.tsx', async () => {
  const { createElement } = await import('react')
  return {
    EChart: (props: { label: string; onBrushEnd?: (from: number, to: number) => void }) =>
      createElement(
        'div',
        { 'data-testid': 'chart', 'aria-label': props.label },
        props.onBrushEnd === undefined
          ? null
          : createElement('button', { onClick: () => props.onBrushEnd?.(Date.parse('2026-10-12T10:00:00Z'), Date.parse('2026-10-12T10:30:00Z')) }, 'drag across chart'),
      ),
  }
})

const password = 'correct horse battery staple'

interface Seen {
  url: URL
  authorization: string | null
}

/** Serves the private metrics for the right password and 401 for any other, and records what was asked. */
function servePrivate(seen: Seen[], answer: () => Response | Promise<Response> = () => HttpResponse.json(privateMetrics())) {
  server.use(
    http.get('/api/v1/status/private/metrics', ({ request }) => {
      const authorization = request.headers.get('Authorization')
      seen.push({ url: new URL(request.url), authorization })
      return authorization === basicAuthorization(password) ? answer() : new HttpResponse(null, { status: 401 })
    }),
  )
}

async function signIn(typed = password) {
  const field = await screen.findByLabelText(/Operator password/)
  await userEvent.type(field, typed)
  await userEvent.click(screen.getByRole('button', { name: 'Open status' }))
}

describe('the status page (NFR-OBS-03)', () => {
  // The page is a lazy route: its first import pays for Vite transforming the modules, which outlasts a wait on a busy machine.
  beforeAll(async () => {
    await preloadStatusPage()
  })

  it('NFR_OBS_03 asks for the operator password first and sends nothing to the Api until it is given', async () => {
    const seen: Seen[] = []
    servePrivate(seen)

    renderAt('/status')

    expect(await screen.findByRole('heading', { name: 'Operator sign-in' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open status' })).toBeDisabled()
    expect(seen).toHaveLength(0)
  })

  it('NFR_OBS_03 a wrong password sends the person back to the form with a plain message', async () => {
    const seen: Seen[] = []
    servePrivate(seen)
    renderAt('/status')

    await signIn('not the password')

    expect(await screen.findByText('That password was not accepted.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Operator sign-in' })).toBeInTheDocument()
    expect(seen[0]!.authorization).toBe(basicAuthorization('not the password'))
  })

  it('NFR_OBS_03 the right password shows the tiles, the objectives and every panel, and is kept nowhere but in memory', async () => {
    const seen: Seen[] = []
    servePrivate(seen)
    renderAt('/status')

    await signIn()

    expect(await screen.findByRole('list', { name: 'Current values' })).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Current values' })).getByText('Jobs done')).toBeInTheDocument()
    const slos = screen.getByRole('list', { name: 'Service level objectives' })
    expect(within(slos).getAllByText('Breached')).toHaveLength(2)
    expect(within(slos).getByText('not measured yet')).toBeInTheDocument()
    expect(within(slos).getAllByText('Met')).toHaveLength(2)
    expect(screen.getByRole('heading', { name: 'Jobs done and failed' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'MusicBrainz response time' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Oldest job waiting' })).toBeInTheDocument()

    expect(seen[0]!.url.searchParams.get('range')).toBe('24h')
    expect(JSON.stringify({ ...localStorage })).not.toContain(password)
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(password)
  })

  it('NFR_OBS_03 choosing another range asks the Api for it, and its width is within what the Api allows', async () => {
    const seen: Seen[] = []
    servePrivate(seen)
    renderAt('/status')
    await signIn()
    await screen.findByRole('list', { name: 'Current values' })

    await userEvent.click(screen.getByRole('button', { name: '6 hours' }))

    await waitFor(() => expect(seen.some((s) => s.url.searchParams.get('range') === '6h')).toBe(true))
    const width = Number(seen.at(-1)!.url.searchParams.get('width'))
    expect(width).toBeGreaterThanOrEqual(10)
    expect(width).toBeLessThanOrEqual(600)
  })

  it('NFR_OBS_03 dragging across a chart zooms every panel to that window, pauses the refresh and can be reset', async () => {
    const seen: Seen[] = []
    servePrivate(seen)
    renderAt('/status')
    await signIn()
    await screen.findByRole('list', { name: 'Current values' })

    await userEvent.click(screen.getAllByRole('button', { name: 'drag across chart' })[0]!)

    await waitFor(() => expect(seen.at(-1)!.url.searchParams.get('from')).toBe('2026-10-12T10:00:00.000Z'))
    expect(seen.at(-1)!.url.searchParams.get('to')).toBe('2026-10-12T10:30:00.000Z')
    expect(seen.at(-1)!.url.searchParams.get('range')).toBeNull()
    expect(screen.getByText(/Zoomed in: refresh is paused/)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Refresh' })).toHaveAttribute('aria-disabled', 'true')

    await userEvent.click(screen.getByRole('button', { name: 'Reset zoom' }))

    await waitFor(() => expect(seen.at(-1)!.url.searchParams.get('range')).toBe('24h'))
    expect(screen.queryByRole('button', { name: 'Reset zoom' })).not.toBeInTheDocument()
  })

  it('NFR_OBS_03 too many requests shows a warning and keeps the page', async () => {
    const seen: Seen[] = []
    servePrivate(seen, () => new HttpResponse(null, { status: 429 }))
    renderAt('/status')

    await signIn()

    expect(await screen.findByText(/Too many requests/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Operator sign-in' })).not.toBeInTheDocument()
  })

  it('NFR_A11Y_01 each panel can be read as a table with the same numbers and gaps said as not measured', async () => {
    const seen: Seen[] = []
    servePrivate(seen)
    renderAt('/status')
    await signIn()
    const panel = (await screen.findByRole('heading', { name: 'Jobs done and failed' })).closest('section')!

    await userEvent.click(within(panel).getByRole('button', { name: 'View as table' }))

    const table = within(panel).getByRole('table')
    expect(within(table).getAllByRole('row')).toHaveLength(6)
    expect(within(table).getAllByText('not measured').length).toBeGreaterThan(0)
    expect(within(table).getByText('12 per minute')).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'View as chart' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('NFR_A11Y_01 each panel says in a sentence what it shows', async () => {
    const seen: Seen[] = []
    servePrivate(seen)
    renderAt('/status')
    await signIn()
    const panel = (await screen.findByRole('heading', { name: 'Jobs done and failed' })).closest('section')!

    expect(within(panel).getByText(/Jobs done and failed over the last 24 hours\. Jobs done: 9 per minute now/)).toBeInTheDocument()
    expect(within(panel).getByText(/Where nothing was measured the line has a gap/)).toBeInTheDocument()
  })

  it('NFR_OBS_03 the heatmap can be read as a table of requests for each response time', async () => {
    const seen: Seen[] = []
    servePrivate(seen)
    renderAt('/status')
    await signIn()
    const panel = (await screen.findByRole('heading', { name: 'MusicBrainz response time' })).closest('section')!

    await userEvent.click(within(panel).getByRole('button', { name: 'View as table' }))

    expect(within(panel).getByRole('row', { name: /up to 0\.25 s 4/ })).toBeInTheDocument()
    expect(within(panel).getByRole('row', { name: /slower than the last bound 1/ })).toBeInTheDocument()
  })

  it('NFR_OBS_03 signing out forgets the numbers and asks for the password again', async () => {
    const seen: Seen[] = []
    servePrivate(seen)
    renderAt('/status')
    await signIn()
    await screen.findByRole('list', { name: 'Current values' })

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(await screen.findByRole('heading', { name: 'Operator sign-in' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Current values' })).not.toBeInTheDocument()
  })

  it('NFR_OBS_03 the status page has no link in the header: it is reached by its address', async () => {
    renderAt('/status')
    await screen.findByRole('heading', { name: 'Operator sign-in' })

    expect(screen.queryByRole('link', { name: /status/i })).not.toBeInTheDocument()
  })
})
