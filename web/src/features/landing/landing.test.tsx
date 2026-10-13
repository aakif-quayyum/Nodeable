import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { components } from '../../api/schema'
import { FakeGraphHub } from '../../test/fakeGraphHub.ts'
import { renderAt } from '../../test/renderApp.tsx'
import { server } from '../../test/server.ts'

type SearchResult = components['schemas']['SearchResultItem']

const redboneMbid = '7408f11c-6c4e-41e5-b81b-6a15bf6cb268'
const graphId = '7c1e0000-0000-4000-8000-000000000000'

const redbone: SearchResult = {
  mbid: redboneMbid,
  title: 'Redbone',
  artist: 'Childish Gambino',
  firstReleaseTitle: 'Awaken, My Love!',
  year: 2016,
  score: 100,
  creditsStatus: null,
  kind: null,
  artReleaseMbid: '2017e952-42c9-41e0-9e39-69d5aa7b17a6',
  artReleaseGroupMbid: 'fd817615-3d43-4f07-9509-d0a46b2bc278',
  versions: [],
}

const remix: SearchResult = {
  ...redbone,
  mbid: 'c0de8952-adda-43e9-aeb9-e749c3422b72',
  title: 'Redbone (WBBL remix)',
  score: 89,
  kind: 'remix',
  versions: [],
}

function serveSearch(results: SearchResult[]) {
  server.use(http.get('/api/v1/search/recordings', () => HttpResponse.json({ source: 'musicBrainz', results })))
}

describe('landing page', () => {
  it('FR_LAND_01 says what Nodeable is, holds the search and explains how it works', async () => {
    renderAt('/')

    expect(await screen.findByRole('heading', { level: 1, name: 'Every song has a crew.' })).toBeInTheDocument()
    expect(screen.getByRole('search', { name: 'Search for a song' })).toBeInTheDocument()

    const steps = screen.getByRole('region', { name: 'How it works' })
    expect(within(steps).getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'Add songs you love',
      'Watch the crew appear',
      'Follow the connectors',
    ])
    expect(screen.getByRole('link', { name: 'MusicBrainz' })).toHaveAttribute('href', 'https://musicbrainz.org/')
  })

  it('FR_LAND_01 offers a way back to the graph only when the browser has one', async () => {
    renderAt('/')
    await screen.findByRole('heading', { level: 1, name: 'Every song has a crew.' })
    expect(screen.queryByRole('link', { name: /Back to your graph/ })).not.toBeInTheDocument()
  })

  it('FR_LAND_01 links to the graph when the browser has one', async () => {
    localStorage.setItem('nodeable.graph', JSON.stringify({ id: graphId, token: 't' }))
    renderAt('/')

    expect(await screen.findByRole('link', { name: /Back to your graph/ })).toHaveAttribute('href', '/graph')
  })

  it('FR_SEARCH_01 runs a suggested search when its chip is chosen', async () => {
    const user = userEvent.setup()
    serveSearch([redbone])
    renderAt('/')

    await user.click(await screen.findByRole('button', { name: 'Redbone' }))

    expect(await screen.findByRole('heading', { level: 2, name: 'Results for “Redbone” by Childish Gambino' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Song title' })).toHaveValue('Redbone')
  })

  it('FR_SEARCH_02 tags a separate recording with what it is and leaves the song itself untagged', async () => {
    serveSearch([redbone, remix])
    renderAt('/?q=Redbone')

    const list = await screen.findByRole('list', { name: 'Search results' })
    const rows = within(list).getAllByRole('listitem')

    expect(within(rows[0]!).queryByText('Remix')).not.toBeInTheDocument()
    expect(within(rows[1]!).getByText('Remix')).toBeInTheDocument()
  })

  it('NFR_A11Y_02 gives the match as text, so the bars are not the only carrier of it', async () => {
    serveSearch([remix])
    renderAt('/?q=Redbone')

    const row = (await screen.findAllByRole('listitem'))[0]!

    expect(within(row).getByText('89% match')).toBeInTheDocument()
    // The six bars are decoration: hidden from assistive technology.
    expect(row.querySelectorAll('[aria-hidden] i')).toHaveLength(6)
  })

  it('FR_GRAPH_02 opens the graph once a song is added from the landing page', async () => {
    const user = userEvent.setup()
    serveSearch([redbone])
    server.use(
      http.post('/api/v1/graphs', () => HttpResponse.json({ id: graphId, name: 'Untitled graph', anonToken: 'tok' }, { status: 201 })),
      http.post(`/api/v1/graphs/${graphId}/songs`, () =>
        HttpResponse.json(
          { song: { mbid: redboneMbid, title: 'Redbone', artist: 'Childish Gambino', year: 2016, creditsStatus: 'loading', addedAt: '2026-10-13T09:00:00Z' }, pendingJobs: 1 },
          { status: 202 },
        ),
      ),
      http.get(`/api/v1/graphs/${graphId}`, () =>
        HttpResponse.json({
          id: graphId,
          name: 'Untitled graph',
          seq: 0,
          songs: [{ mbid: redboneMbid, title: 'Redbone', artist: 'Childish Gambino', year: 2016, creditsStatus: 'loading', addedAt: '2026-10-13T09:00:00Z' }],
          people: [],
          credits: [],
          hubs: [],
          crawl: { queued: 1, done: 0, failed: 0, etaSeconds: 1 },
        }),
      ),
    )
    renderAt('/?q=Redbone', { graphConnection: () => new FakeGraphHub() })

    await user.click(await screen.findByRole('button', { name: 'Add to graph: Redbone by Childish Gambino' }))

    expect(await screen.findByRole('region', { name: 'Your graph' })).toBeInTheDocument()
  })
})
