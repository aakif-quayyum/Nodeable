import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeAll, describe, expect, it } from 'vitest'
import { FakeGraphHub } from '../../test/fakeGraphHub.ts'
import { renderAt } from '../../test/renderApp.tsx'
import { server } from '../../test/server.ts'
import { sampleSnapshot } from '../../test/workspaceFixtures.ts'
import { preloadGraphView } from '../../test/lazyChunks.ts'

const graphId = '7c1e0000-0000-4000-8000-000000000000'
const candidate = '00000000-0000-4000-8000-000000000101'

const item = {
  mbid: candidate,
  title: 'Sober',
  artist: 'Childish Gambino',
  year: 2014,
  hubCount: 1,
  sharedSongs: 2,
  reason: 'Credited with Donald Glover (songwriter, on 2 of your songs)',
  hubs: [{ mbid: 'donald', name: 'Donald Glover', graphSongs: 2, roles: ['songwriter'] }],
}

function serveGraph(withHub: boolean) {
  localStorage.setItem('nodeable.graph', JSON.stringify({ id: graphId, token: 'token-for-the-test' }))
  const snapshot = sampleSnapshot()
  snapshot.hubs = withHub ? [{ personMbid: 'donald', songs: 2, roles: ['songwriter'] }] : []
  server.use(http.get(`/api/v1/graphs/${graphId}`, () => HttpResponse.json(snapshot)))
}

describe('recommendations in the graph workspace', () => {
  beforeAll(async () => {
    await preloadGraphView()
  })

  it('FR_REC_02 each suggestion shows its title, artist and the reason, asked of the Api with the graph token', async () => {
    serveGraph(true)
    let token: string | null = null
    server.use(
      http.get(`/api/v1/graphs/${graphId}/recommendations`, ({ request }) => {
        token = request.headers.get('X-Graph-Token')
        return HttpResponse.json({ items: [item] })
      }),
    )

    renderAt('/graph', { graphConnection: () => new FakeGraphHub() })

    const section = await screen.findByRole('region', { name: 'Recommended' })
    expect(await within(section).findByText(/Sober/)).toBeInTheDocument()
    expect(within(section).getByText('Credited with Donald Glover (songwriter, on 2 of your songs)')).toBeInTheDocument()
    expect(token).toBe('token-for-the-test')
  })

  it('FR_REC_01 a graph without hubs asks for nothing and says what makes suggestions appear', async () => {
    serveGraph(false)
    let asked = false
    server.use(
      http.get(`/api/v1/graphs/${graphId}/recommendations`, () => {
        asked = true
        return HttpResponse.json({ items: [] })
      }),
    )

    renderAt('/graph', { graphConnection: () => new FakeGraphHub() })

    expect(await screen.findByText(/Suggestions come from people credited on more than one of your songs/)).toBeInTheDocument()
    expect(asked).toBe(false)
  })

  it('FR_REC_01 Add puts the suggested song into the graph through the add-song request', async () => {
    serveGraph(true)
    let added: unknown = null
    server.use(
      http.get(`/api/v1/graphs/${graphId}/recommendations`, () => HttpResponse.json({ items: [item] })),
      http.post(`/api/v1/graphs/${graphId}/songs`, async ({ request }) => {
        added = await request.json()
        return HttpResponse.json(
          { song: { mbid: candidate, title: 'Sober', artist: 'Childish Gambino', year: 2014, creditsStatus: 'none' }, pendingJobs: 1 },
          { status: 202 },
        )
      }),
    )

    renderAt('/graph', { graphConnection: () => new FakeGraphHub() })
    await userEvent.click(await screen.findByRole('button', { name: 'Add Sober to your graph' }))

    await waitFor(() => expect(added).toEqual({ recordingMbid: candidate }))
  })

  it('FR_REC_01 a refused request shows a plain message instead of an empty list', async () => {
    serveGraph(true)
    server.use(http.get(`/api/v1/graphs/${graphId}/recommendations`, () => new HttpResponse(null, { status: 429 })))

    renderAt('/graph', { graphConnection: () => new FakeGraphHub() })

    expect(await screen.findByText(/Recommendations are not available right now/)).toBeInTheDocument()
  })
})
