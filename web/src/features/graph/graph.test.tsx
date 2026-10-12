import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import type { components } from '../../api/schema'
import { FakeGraphHub } from '../../test/fakeGraphHub.ts'
import { useSelection } from '../../stores/selection.ts'
import { renderAt } from '../../test/renderApp.tsx'
import { server } from '../../test/server.ts'

type Snapshot = components['schemas']['GraphSnapshot']
type Song = components['schemas']['GraphSongItem']

const graphId = '7c1e0000-0000-4000-8000-000000000000'
const token = 'token-for-the-test'
const redboneMbid = '7408f11c-6c4e-41e5-b81b-6a15bf6cb268'
const americaMbid = 'dc316772-0ef2-4b31-9ee5-c0b3cf1a1c1e'
const donald = { mbid: '1ba09d36-5d9d-4a23-8b52-2f2e4d5b1b11', name: 'Donald Glover' }
const ludwig = { mbid: '9a7f3a5e-1d0f-4d1a-93f2-6e0a91b6f4c2', name: 'Ludwig Göransson' }

const redbone: Song = {
  mbid: redboneMbid,
  title: 'Redbone',
  artist: 'Childish Gambino',
  year: 2016,
  creditsStatus: 'loading',
  addedAt: '2026-10-12T09:09:45Z',
}

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    id: graphId,
    name: 'Untitled graph',
    seq: 5,
    songs: [],
    people: [],
    credits: [],
    hubs: [],
    crawl: { queued: 0, done: 0, failed: 0, etaSeconds: 0 },
    ...overrides,
  }
}

function rememberGraph() {
  localStorage.setItem('nodeable.graph', JSON.stringify({ id: graphId, token }))
}

function serveSnapshot(read: () => Snapshot, hub?: FakeGraphHub) {
  server.use(
    http.get(`/api/v1/graphs/${graphId}`, () => {
      hub?.calls.push('GET snapshot')
      return HttpResponse.json(read())
    }),
  )
}

const searchResult = {
  mbid: redboneMbid,
  title: 'Redbone',
  artist: 'Childish Gambino',
  firstReleaseTitle: 'Awaken, My Love!',
  year: 2016,
  score: 100,
  creditsStatus: null,
  versions: [],
}

function serveSearch() {
  server.use(
    http.get('/api/v1/search/recordings', () => HttpResponse.json({ source: 'musicBrainz', results: [searchResult] })),
  )
}

describe('graph list view', () => {
  afterEach(() => {
    useSelection.setState({ selectedId: null })
  })

  it('FR_GRAPH_02 adds a song from the search, shows its node at once and fills in credits as events arrive', async () => {
    const user = userEvent.setup()
    const hub = new FakeGraphHub()
    let current = snapshot({ seq: 0 })
    let postedBody: unknown = null
    let postedToken: string | null = null

    serveSearch()
    server.use(
      http.post('/api/v1/graphs', () =>
        HttpResponse.json({ id: graphId, name: 'Untitled graph', anonToken: token }, { status: 201 }),
      ),
      http.post(`/api/v1/graphs/${graphId}/songs`, async ({ request }) => {
        postedBody = await request.json()
        postedToken = request.headers.get('x-graph-token')
        current = snapshot({ seq: 0, songs: [redbone], crawl: { queued: 1, done: 0, failed: 0, etaSeconds: 1 } })
        return HttpResponse.json({ song: redbone, pendingJobs: 1 }, { status: 202 })
      }),
    )
    serveSnapshot(() => current, hub)

    renderAt('/?q=Redbone', { graphConnection: () => hub })
    await user.click(await screen.findByRole('button', { name: 'Add to graph: Redbone by Childish Gambino' }))

    // The song is in the list as soon as the graph loads, still waiting for its credits.
    const songs = await screen.findByRole('table', { name: 'Songs and their credits' })
    expect(within(songs).getByText('Redbone')).toBeInTheDocument()
    expect(within(songs).getByText('Fetching credits…')).toBeInTheDocument()
    expect(postedBody).toEqual({ recordingMbid: redboneMbid })
    expect(postedToken).toBe(token)
    expect(JSON.parse(localStorage.getItem('nodeable.graph') ?? 'null')).toEqual({ id: graphId, token })
    expect(screen.getByRole('button', { name: 'Redbone is in your graph' })).toBeDisabled()

    act(() => {
      hub.emit('CreditsResolved', {
        seq: 1,
        songMbid: redboneMbid,
        people: [donald],
        credits: [{ personMbid: donald.mbid, role: 'songwriter', detail: '', level: 'recording' }],
      })
      hub.emit('SongStatusChanged', { seq: 2, songMbid: redboneMbid, creditsStatus: 'complete' })
    })

    expect(await within(songs).findByText('Donald Glover — Songwriter')).toBeInTheDocument()
    expect(within(songs).getByText('Credits complete')).toBeInTheDocument()
    expect(within(songs).queryByText('Fetching credits…')).not.toBeInTheDocument()
  })

  it('FR_GRAPH_02 joins the graph before it loads the snapshot, with the token as an argument', async () => {
    const hub = new FakeGraphHub()
    let answerJoin: () => void = () => undefined
    // A slow join: if the snapshot were requested at the same time, it would show up in the calls while this waits.
    hub.joinGate = new Promise<void>((resolve) => {
      answerJoin = resolve
    })
    rememberGraph()
    serveSnapshot(() => snapshot({ songs: [{ ...redbone, creditsStatus: 'complete' }] }), hub)

    renderAt('/', { graphConnection: () => hub })
    await waitFor(() => expect(hub.calls).toContain(`JoinGraph(${graphId}, ${token})`))
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(hub.calls).not.toContain('GET snapshot')

    answerJoin()
    await screen.findByRole('table', { name: 'Songs and their credits' })

    expect(hub.calls).toEqual(['start', `JoinGraph(${graphId}, ${token})`, 'GET snapshot'])
  })

  it('FR_GRAPH_02 keeps an event that arrives while the snapshot is loading', async () => {
    const hub = new FakeGraphHub()
    rememberGraph()
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.get(`/api/v1/graphs/${graphId}`, async () => {
        hub.calls.push('GET snapshot')
        await gate
        // The snapshot was read at seq 5 and does not contain the credit of event 6.
        return HttpResponse.json(snapshot({ seq: 5, songs: [redbone] }))
      }),
    )

    renderAt('/', { graphConnection: () => hub })
    await waitFor(() => expect(hub.calls).toContain('GET snapshot'))

    act(() => {
      hub.emit('CreditsResolved', {
        seq: 6,
        songMbid: redboneMbid,
        people: [donald],
        credits: [{ personMbid: donald.mbid, role: 'producer', detail: '', level: 'recording' }],
      })
      // Already part of the snapshot: dropped, so it must not undo or duplicate anything.
      hub.emit('SongStatusChanged', { seq: 4, songMbid: redboneMbid, creditsStatus: 'none' })
    })
    release()

    const songs = await screen.findByRole('table', { name: 'Songs and their credits' })
    expect(await within(songs).findByText('Donald Glover — Producer')).toBeInTheDocument()
    expect(within(songs).getByText('Fetching credits…')).toBeInTheDocument()
  })

  it('FR_GRAPH_03 lists people with the number of songs, marks hubs, and names an other credit by its detail', async () => {
    rememberGraph()
    const america: Song = { ...redbone, mbid: americaMbid, title: 'This Is America', year: 2018, creditsStatus: 'complete' }
    serveSnapshot(() =>
      snapshot({
        songs: [{ ...redbone, creditsStatus: 'complete' }, america],
        people: [donald, ludwig],
        credits: [
          { songMbid: redboneMbid, personMbid: donald.mbid, role: 'songwriter', detail: '', level: 'recording' },
          { songMbid: americaMbid, personMbid: donald.mbid, role: 'songwriter', detail: '', level: 'recording' },
          { songMbid: redboneMbid, personMbid: ludwig.mbid, role: 'other', detail: 'Arranger', level: 'recording' },
          { songMbid: redboneMbid, personMbid: ludwig.mbid, role: 'producer', detail: '', level: 'recording' },
        ],
      }),
    )

    renderAt('/', { graphConnection: () => new FakeGraphHub() })

    const people = await screen.findByRole('table', { name: 'People, most songs first' })
    const rows = within(people).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    expect(within(rows[0]!).getByRole('rowheader')).toHaveTextContent('Donald Glover')
    expect(within(rows[0]!).getByText('Hub')).toBeInTheDocument()
    expect(within(rows[0]!).getByRole('cell', { name: '2' })).toBeInTheDocument()
    expect(within(rows[1]!).getByRole('rowheader')).toHaveTextContent('Ludwig Göransson')
    expect(within(rows[1]!).queryByText('Hub')).not.toBeInTheDocument()
    expect(within(rows[1]!).getByText('Arranger')).toBeInTheDocument()
  })

  it('FR_GRAPH_04 shows a credits incomplete badge, linking to MusicBrainz, when there is no producer or songwriter', async () => {
    rememberGraph()
    serveSnapshot(() =>
      snapshot({
        songs: [{ ...redbone, creditsStatus: 'partial' }],
        people: [donald],
        credits: [{ songMbid: redboneMbid, personMbid: donald.mbid, role: 'vocal', detail: '', level: 'recording' }],
      }),
    )

    renderAt('/', { graphConnection: () => new FakeGraphHub() })

    expect(await screen.findByText('Credits incomplete')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /Add credits on MusicBrainz for Redbone/ })
    expect(link).toHaveAttribute('href', `https://musicbrainz.org/recording/${redboneMbid}`)
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('FR_GRAPH_04 does not show the badge for a song that is still being fetched', async () => {
    rememberGraph()
    serveSnapshot(() => snapshot({ songs: [redbone] }))

    renderAt('/', { graphConnection: () => new FakeGraphHub() })

    await screen.findByText('Fetching credits…')
    expect(screen.queryByText('Credits incomplete')).not.toBeInTheDocument()
  })

  it('FR_GRAPH_01 removes a song from the graph', async () => {
    const user = userEvent.setup()
    rememberGraph()
    let songs: Song[] = [{ ...redbone, creditsStatus: 'complete' }]
    serveSnapshot(() => snapshot({ songs }))
    server.use(
      http.delete(`/api/v1/graphs/${graphId}/songs/${redboneMbid}`, () => {
        songs = []
        return new HttpResponse(null, { status: 204 })
      }),
    )

    renderAt('/', { graphConnection: () => new FakeGraphHub() })
    await user.click(await screen.findByRole('button', { name: 'Remove Redbone by Childish Gambino from your graph' }))

    expect(await screen.findByText(/Your graph is empty/)).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Songs and their credits' })).not.toBeInTheDocument()
  })

  it('FR_GRAPH_01 says the graph is full when the 51st song is refused', async () => {
    const user = userEvent.setup()
    rememberGraph()
    serveSearch()
    serveSnapshot(() => snapshot())
    server.use(
      http.post(`/api/v1/graphs/${graphId}/songs`, () =>
        HttpResponse.json({ type: '/errors/graph-full', title: 'Graph is full', status: 409 }, { status: 409 }),
      ),
    )

    renderAt('/?q=Redbone', { graphConnection: () => new FakeGraphHub() })
    await user.click(await screen.findByRole('button', { name: 'Add to graph: Redbone by Childish Gambino' }))

    expect(await screen.findByText(/Your graph is full: it holds up to 50 songs/)).toBeInTheDocument()
  })

  it('FR_GRAPH_01 marks a result that is already in the graph and does not offer to add it again', async () => {
    rememberGraph()
    serveSearch()
    serveSnapshot(() => snapshot({ songs: [{ ...redbone, creditsStatus: 'complete' }] }))

    renderAt('/?q=Redbone', { graphConnection: () => new FakeGraphHub() })

    const button = await screen.findByRole('button', { name: 'Redbone is in your graph' })
    expect(button).toBeDisabled()
    expect(button).toHaveTextContent('In your graph')
  })

  it('FR_GRAPH_01 forgets a graph the server no longer has and goes back to the introduction', async () => {
    rememberGraph()
    server.use(
      http.get(`/api/v1/graphs/${graphId}`, () =>
        HttpResponse.json({ type: '/errors/graph-not-found', title: 'Not found', status: 404 }, { status: 404 }),
      ),
    )

    renderAt('/', { graphConnection: () => new FakeGraphHub() })

    expect(await screen.findByText(/Discover music through the people who made it/)).toBeInTheDocument()
    expect(localStorage.getItem('nodeable.graph')).toBeNull()
  })

  it('FR_GRAPH_02 joins again and loads the snapshot again after a reconnect', async () => {
    const hub = new FakeGraphHub()
    rememberGraph()
    serveSnapshot(() => snapshot({ songs: [redbone] }), hub)

    renderAt('/', { graphConnection: () => hub })
    await screen.findByRole('table', { name: 'Songs and their credits' })

    act(() => hub.simulateReconnecting())
    expect(await screen.findByText(/Reconnecting/)).toBeInTheDocument()

    act(() => hub.simulateReconnected())
    await waitFor(() => expect(hub.calls.filter((call) => call === 'GET snapshot')).toHaveLength(2))
    expect(hub.calls.filter((call) => call.startsWith('JoinGraph'))).toHaveLength(2)
    expect(screen.queryByText(/Reconnecting/)).not.toBeInTheDocument()
  })

  it('FR_GRAPH_02 still shows the graph when the live connection cannot be made', async () => {
    const hub = new FakeGraphHub()
    hub.start = () => Promise.reject(new Error('no hub'))
    rememberGraph()
    serveSnapshot(() => snapshot({ songs: [redbone] }))

    renderAt('/', { graphConnection: () => hub })

    expect(await screen.findByRole('table', { name: 'Songs and their credits' })).toBeInTheDocument()
    expect(screen.getByText(/Live updates are off/)).toBeInTheDocument()
  })

  it('NFR_A11Y_01 gives the graph a heading and a status line for progress, in a section named by its heading', async () => {
    rememberGraph()
    serveSnapshot(() => snapshot({ songs: [redbone], crawl: { queued: 3, done: 1, failed: 0, etaSeconds: 3 } }))

    renderAt('/', { graphConnection: () => new FakeGraphHub() })

    expect(await screen.findByRole('heading', { level: 2, name: 'Your graph · 1 song' })).toBeInTheDocument()
    const section = screen.getByRole('region', { name: /Your graph/ })
    expect(within(section).getByRole('status')).toHaveTextContent('Fetching credits: 3 lookups waiting, about 3 seconds to go')
  })

  it('FR_HUB_01 names the canvas with how many songs and people it shows and says the tables have the same data', async () => {
    rememberGraph()
    serveSnapshot(() =>
      snapshot({
        songs: [{ ...redbone, creditsStatus: 'complete' }],
        people: [donald],
        credits: [{ songMbid: redboneMbid, personMbid: donald.mbid, role: 'songwriter', detail: '', level: 'recording' }],
      }),
    )

    renderAt('/', { graphConnection: () => new FakeGraphHub() })

    const canvas = await screen.findByRole('img', { name: /Graph of 1 song and 1 person/ })
    expect(canvas).toHaveAccessibleName(expect.stringContaining('The lists below hold the same information'))
  })

  it('FR_HUB_01 shows a clicked person from the graph data: songs credited on, roles, and a link to MusicBrainz', async () => {
    rememberGraph()
    const america: Song = { ...redbone, mbid: americaMbid, title: 'This Is America', year: 2018, creditsStatus: 'complete' }
    serveSnapshot(() =>
      snapshot({
        songs: [{ ...redbone, creditsStatus: 'complete' }, america],
        people: [donald],
        credits: [
          { songMbid: redboneMbid, personMbid: donald.mbid, role: 'songwriter', detail: '', level: 'recording' },
          { songMbid: americaMbid, personMbid: donald.mbid, role: 'instrument', detail: 'drums', level: 'recording' },
        ],
      }),
    )

    renderAt('/', { graphConnection: () => new FakeGraphHub() })
    await screen.findByRole('table', { name: 'Songs and their credits' })
    expect(screen.queryByRole('region', { name: /Details:/ })).not.toBeInTheDocument()

    // The canvas writes the selection; here the store is set the way a click on the node would set it.
    act(() => useSelection.getState().select(`person:${donald.mbid}`))

    const panel = await screen.findByRole('region', { name: 'Details: Donald Glover' })
    expect(within(panel).getByText(/Credited on 2 songs in your graph · a hub/)).toBeInTheDocument()
    expect(within(panel).getByText('Redbone')).toBeInTheDocument()
    expect(within(panel).getByText('Instrument · drums')).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: /Donald Glover on MusicBrainz/ })).toHaveAttribute(
      'href',
      `https://musicbrainz.org/artist/${donald.mbid}`,
    )

    await userEvent.click(within(panel).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('region', { name: /Details:/ })).not.toBeInTheDocument()
  })

  it('FR_HUB_01 shows a clicked song with its credits, and shows nothing when the selected node is gone', async () => {
    rememberGraph()
    serveSnapshot(() =>
      snapshot({
        songs: [{ ...redbone, creditsStatus: 'complete' }],
        people: [donald],
        credits: [{ songMbid: redboneMbid, personMbid: donald.mbid, role: 'producer', detail: '', level: 'recording' }],
      }),
    )

    renderAt('/', { graphConnection: () => new FakeGraphHub() })
    await screen.findByRole('table', { name: 'Songs and their credits' })

    act(() => useSelection.getState().select(`song:${redboneMbid}`))
    const panel = await screen.findByRole('region', { name: 'Details: Redbone' })
    expect(within(panel).getByText('Donald Glover — Producer')).toBeInTheDocument()

    act(() => useSelection.getState().select('person:00000000-0000-4000-8000-000000000000'))
    await waitFor(() => expect(screen.queryByRole('region', { name: /Details:/ })).not.toBeInTheDocument())
  })
})
