import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { components } from '../../api/schema'
import { FakeGraphHub } from '../../test/fakeGraphHub.ts'
import { renderAt } from '../../test/renderApp.tsx'
import { server } from '../../test/server.ts'

type SearchResult = components['schemas']['SearchResultItem']

const graphId = '7c1e0000-0000-4000-8000-000000000000'
const redboneMbid = '7408f11c-6c4e-41e5-b81b-6a15bf6cb268'

const redbone: SearchResult = {
  mbid: redboneMbid,
  title: 'Redbone',
  artist: 'Childish Gambino',
  firstReleaseTitle: 'Awaken, My Love!',
  year: 2016,
  score: 100,
  creditsStatus: null,
  kind: null,
  versions: [
    {
      mbid: 'e493730c-06d8-40b6-9c9e-c86dcc85ca4b',
      title: 'Redbone',
      artist: 'Childish Gambino',
      firstReleaseTitle: 'Annie Mac Presents 2017',
      year: 2017,
      score: 100,
      kind: 'compilation',
      note: null,
      creditsStatus: null,
    },
  ],
}

function serveSearch(results: SearchResult[]) {
  server.use(http.get('/api/v1/search/recordings', () => HttpResponse.json({ source: 'musicBrainz', results })))
}

function rememberGraph() {
  localStorage.setItem('nodeable.graph', JSON.stringify({ id: graphId, token: 'tok' }))
  server.use(
    http.get(`/api/v1/graphs/${graphId}`, () =>
      HttpResponse.json({ id: graphId, name: 'Untitled graph', seq: 0, songs: [], people: [], credits: [], hubs: [], crawl: { queued: 0, done: 0, failed: 0, etaSeconds: 0 } }),
    ),
  )
}

describe('add-a-song sheet', () => {
  it('FR_SEARCH_01 opens from the header as a dialog with the search, and keeps the search in the address', async () => {
    const user = userEvent.setup()
    rememberGraph()
    serveSearch([redbone])
    renderAt('/graph', { graphConnection: () => new FakeGraphHub() })

    await user.click(await screen.findByRole('button', { name: '+ Add a song' }))

    const dialog = await screen.findByRole('dialog', { name: 'Add a song' })
    await user.type(within(dialog).getByRole('textbox', { name: 'Song title' }), 'Redbone{Enter}')

    expect(await within(dialog).findByRole('heading', { level: 2, name: 'Results for “Redbone”' })).toBeInTheDocument()
    expect(within(dialog).getByText('Redbone')).toBeInTheDocument()
  })

  it('FR_SEARCH_01 closes with the Close button and with Escape, and the page behind it is still there', async () => {
    const user = userEvent.setup()
    rememberGraph()
    renderAt('/graph?sheet=add', { graphConnection: () => new FakeGraphHub() })

    const dialog = await screen.findByRole('dialog', { name: 'Add a song' })
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '+ Add a song' }))
    expect(await screen.findByRole('dialog', { name: 'Add a song' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('FR_SEARCH_02 expands the folded versions in the sheet and lists them under the result', async () => {
    const user = userEvent.setup()
    rememberGraph()
    serveSearch([redbone])
    renderAt('/graph?sheet=add&q=Redbone', { graphConnection: () => new FakeGraphHub() })

    const dialog = await screen.findByRole('dialog', { name: 'Add a song' })
    await user.click(await within(dialog).findByRole('button', { name: 'Show 1 other version' }))

    const versions = within(within(dialog).getByRole('list', { name: 'Other versions of Redbone' })).getAllByRole('listitem')
    expect(versions).toHaveLength(1)
    expect(within(versions[0]!).getByText('Compilation')).toBeInTheDocument()
  })

  it('FR_GRAPH_02 closes the sheet after a song is added and leaves the graph where it is', async () => {
    const user = userEvent.setup()
    rememberGraph()
    serveSearch([{ ...redbone, versions: [] }])
    server.use(
      http.post(`/api/v1/graphs/${graphId}/songs`, () =>
        HttpResponse.json(
          { song: { mbid: redboneMbid, title: 'Redbone', artist: 'Childish Gambino', year: 2016, creditsStatus: 'loading', addedAt: '2026-10-13T09:00:00Z' }, pendingJobs: 1 },
          { status: 202 },
        ),
      ),
    )
    renderAt('/graph?sheet=add&q=Redbone', { graphConnection: () => new FakeGraphHub() })

    const dialog = await screen.findByRole('dialog', { name: 'Add a song' })
    await user.click(await within(dialog).findByRole('button', { name: 'Add to graph: Redbone by Childish Gambino' }))

    await screen.findByRole('heading', { level: 1, name: /Your graph/ })
    await expect(screen.findByRole('dialog')).rejects.toThrow()
  })
})
