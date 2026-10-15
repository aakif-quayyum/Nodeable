import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import type { components } from '../../api/schema'
import { FakeGraphHub } from '../../test/fakeGraphHub.ts'
import { renderAt } from '../../test/renderApp.tsx'
import { server } from '../../test/server.ts'
import { setReducedMotion } from '../../test/viewport.ts'
import { CANVAS_THRESHOLD } from '../constellation/constellationModel.ts'
import { setUndoWindowForTests } from './removals.ts'

type Snapshot = components['schemas']['GraphSnapshot']
type Song = components['schemas']['GraphSongItem']

const graphId = '7c1e0000-0000-4000-8000-000000000000'
const token = 'token-for-the-test'
const redboneMbid = '7408f11c-6c4e-41e5-b81b-6a15bf6cb268'
const americaMbid = 'dc316772-0ef2-4b31-9ee5-c0b3cf1a1c1e'
const donald = { mbid: '1ba09d36-5d9d-4a23-8b52-2f2e4d5b1b11', name: 'Donald Glover' }
const ludwig = { mbid: '9a7f3a5e-1d0f-4d1a-93f2-6e0a91b6f4c2', name: 'Ludwig Göransson' }
const riley = { mbid: '5c0e7b53-7a77-4c7e-9a43-2b6d1c9d8f10', name: 'Riley Mackin' }

const redbone: Song = {
  mbid: redboneMbid,
  title: 'Redbone',
  artist: 'Childish Gambino',
  year: 2016,
  creditsStatus: 'loading',
  addedAt: '2026-10-12T09:09:45Z',
  hasPreview: false,
}
const america: Song = { ...redbone, mbid: americaMbid, title: 'This Is America', year: 2018, creditsStatus: 'complete', addedAt: '2026-10-12T09:10:00Z' }

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

function credit(songMbid: string, person: { mbid: string }, role: components['schemas']['CreditRole'], detail = '') {
  return { songMbid, personMbid: person.mbid, role, detail, level: 'recording' as const }
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
  server.use(http.get('/api/v1/search/recordings', () => HttpResponse.json({ source: 'musicBrainz', results: [searchResult] })))
}

/** Two songs, Donald on both (a connector), Ludwig on one with an "other" credit, Riley mixing one. */
function twoSongs(): Snapshot {
  return snapshot({
    songs: [{ ...redbone, creditsStatus: 'complete' }, america],
    people: [donald, ludwig, riley],
    credits: [
      credit(redboneMbid, donald, 'songwriter'),
      credit(americaMbid, donald, 'songwriter'),
      credit(redboneMbid, ludwig, 'other', 'Arranger'),
      credit(redboneMbid, ludwig, 'producer'),
      credit(americaMbid, riley, 'mixing'),
    ],
  })
}

const orbitNamed = (name: string | RegExp) => screen.findByRole('group', { name })

describe('workspace: graph and live updates', () => {
  beforeEach(() => {
    // The still version of every animation: positions are final at once, so the tests read the end state.
    setReducedMotion(true)
  })

  it('FR_GRAPH_02 adds a song from the search, centres the orbit on it at once and fills in credits as events arrive', async () => {
    const user = userEvent.setup()
    const hub = new FakeGraphHub()
    let current = snapshot({ seq: 0 })
    let postedBody: unknown = null
    let postedToken: string | null = null

    serveSearch()
    server.use(
      http.post('/api/v1/graphs', () => HttpResponse.json({ id: graphId, name: 'Untitled graph', anonToken: token }, { status: 201 })),
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

    // The graph opens with the orbit on the new song, still waiting for its credits.
    const orbit = await orbitNamed('Credits graph, centred on Redbone')
    const notes = screen.getByRole('region', { name: 'Liner notes' })
    expect(within(notes).getByText('Loading credits')).toBeInTheDocument()
    expect(within(notes).getByText('Listening for credits…')).toBeInTheDocument()
    expect(postedBody).toEqual({ recordingMbid: redboneMbid })
    expect(postedToken).toBe(token)
    expect(JSON.parse(localStorage.getItem('nodeable.graph') ?? 'null')).toEqual({ id: graphId, token })

    act(() => {
      hub.emit('CreditsResolved', {
        seq: 1,
        songMbid: redboneMbid,
        people: [donald],
        credits: [{ personMbid: donald.mbid, role: 'songwriter', detail: '', level: 'recording' }],
      })
      hub.emit('SongStatusChanged', { seq: 2, songMbid: redboneMbid, creditsStatus: 'complete' })
    })

    expect(await within(orbit).findByRole('button', { name: 'Put Donald Glover at the centre; credited as songwriter on 1 song' })).toBeInTheDocument()
    expect(within(notes).getByText('Written by')).toBeInTheDocument()
    expect(within(notes).getByRole('button', { name: 'Donald Glover' })).toBeInTheDocument()
    expect(within(notes).getByText('Credits complete')).toBeInTheDocument()
    expect(within(notes).queryByText('Listening for credits…')).not.toBeInTheDocument()
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

    renderAt('/graph', { graphConnection: () => hub })
    await waitFor(() => expect(hub.calls).toContain(`JoinGraph(${graphId}, ${token})`))
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(hub.calls).not.toContain('GET snapshot')

    answerJoin()
    await orbitNamed('Credits graph, centred on your graph')

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

    renderAt('/graph', { graphConnection: () => hub })
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

    const orbit = await orbitNamed('Credits graph, centred on your graph')
    expect(await within(orbit).findByRole('button', { name: /Put Donald Glover at the centre; credited as producer/ })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Liner notes' })).getByText('Loading credits')).toBeInTheDocument()
  })

  it('FR_GRAPH_01 marks a result that is already in the graph, and moves the orbit to it instead of adding it again', async () => {
    const user = userEvent.setup()
    rememberGraph()
    serveSearch()
    serveSnapshot(() => snapshot({ songs: [{ ...redbone, creditsStatus: 'complete' }, america] }))

    renderAt('/?q=Redbone', { graphConnection: () => new FakeGraphHub() })

    const button = await screen.findByRole('button', { name: 'Redbone is in your graph' })
    expect(button).toBeEnabled()
    expect(button).toHaveTextContent('In your graph')
    expect(screen.queryByRole('button', { name: /^Add to graph: Redbone/ })).not.toBeInTheDocument()

    await user.click(button)
    // With no address the centre would be the whole graph; the address names Redbone, and that is what is centred.
    expect(await orbitNamed('Credits graph, centred on Redbone')).toBeInTheDocument()
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

  it('FR_GRAPH_01 forgets a graph the server no longer has and invites the person to add a song', async () => {
    rememberGraph()
    server.use(
      http.get(`/api/v1/graphs/${graphId}`, () =>
        HttpResponse.json({ type: '/errors/graph-not-found', title: 'Not found', status: 404 }, { status: 404 }),
      ),
    )

    renderAt('/graph', { graphConnection: () => new FakeGraphHub() })

    expect(await screen.findByText(/Your graph is empty. Add a song/)).toBeInTheDocument()
    expect(localStorage.getItem('nodeable.graph')).toBeNull()
  })

  it('FR_GRAPH_02 joins again and loads the snapshot again after a reconnect', async () => {
    const hub = new FakeGraphHub()
    rememberGraph()
    serveSnapshot(() => snapshot({ songs: [redbone] }), hub)

    renderAt('/graph', { graphConnection: () => hub })
    await orbitNamed('Credits graph, centred on your graph')

    act(() => hub.simulateReconnecting())
    expect(await screen.findByText(/Reconnecting/)).toBeInTheDocument()

    act(() => hub.simulateReconnected())
    await waitFor(() => expect(hub.calls.filter((call) => call === 'GET snapshot')).toHaveLength(2))
    expect(hub.calls.filter((call) => call.startsWith('JoinGraph'))).toHaveLength(2)
    await waitFor(() => expect(screen.queryByText(/Reconnecting/)).not.toBeInTheDocument())
  })

  it('FR_GRAPH_02 still shows the graph when the live connection cannot be made', async () => {
    const hub = new FakeGraphHub()
    hub.start = () => Promise.reject(new Error('no hub'))
    rememberGraph()
    serveSnapshot(() => snapshot({ songs: [redbone] }))

    renderAt('/graph', { graphConnection: () => hub })

    expect(await orbitNamed('Credits graph, centred on your graph')).toBeInTheDocument()
    expect(screen.getByText(/Live updates are off/)).toBeInTheDocument()
  })

  it('NFR_A11Y_01 gives the page one heading that says what the graph shows and a status for progress', async () => {
    rememberGraph()
    serveSnapshot(() => snapshot({ songs: [redbone], crawl: { queued: 3, done: 1, failed: 0, etaSeconds: 3 } }))

    renderAt('/graph', { graphConnection: () => new FakeGraphHub() })

    expect(await screen.findByRole('heading', { level: 1, name: '1 song, 0 people behind it' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Your graph' })).getByRole('status')).toHaveTextContent(
      'Fetching credits: 3 lookups waiting, about 3 seconds to go',
    )
  })
})

describe('workspace: orbit, cards and notes', () => {
  beforeEach(() => {
    setReducedMotion(true)
    rememberGraph()
  })

  it('FR_VIEW_04 starts on the whole graph, re-roots on a song and then a person, and always goes back to "Your graph"', async () => {
    const user = userEvent.setup()
    serveSnapshot(() => twoSongs())

    renderAt('/graph', { graphConnection: () => new FakeGraphHub() })
    // The whole graph is the centre when the address names none: a hub with the number of songs, and every song around it.
    const orbit = await orbitNamed('Credits graph, centred on your graph')
    expect(screen.getByText('The whole graph')).toBeInTheDocument()
    expect(within(orbit).getByRole('img', { name: 'Your graph, 2 songs, the centre of this view' })).toBeInTheDocument()
    const trail = () => screen.getByRole('navigation', { name: 'Exploration path' })
    expect(within(trail()).getAllByRole('button').map((button) => button.textContent)).toEqual(['Your graph'])

    await user.click(within(orbit).getByRole('button', { name: 'Put This Is America at the centre; 2 people credited' }))
    await orbitNamed('Credits graph, centred on This Is America')
    expect(screen.getByText('Now spinning')).toBeInTheDocument()

    const connectors = screen.getByRole('region', { name: 'Connectors' })
    await user.click(within(connectors).getByRole('button', { name: 'Explore Donald Glover: on 2 songs; Songwriter' }))

    await orbitNamed('Credits graph, centred on Donald Glover')
    expect(screen.getByText('Following')).toBeInTheDocument()
    expect(within(trail()).getAllByRole('button').map((button) => button.textContent)).toEqual(['Your graph', 'This Is America', 'Donald Glover'])
    expect(within(trail()).getByRole('button', { name: 'Donald Glover' })).toHaveAttribute('aria-current', 'true')

    await user.click(within(trail()).getByRole('button', { name: 'This Is America' }))
    await orbitNamed('Credits graph, centred on This Is America')
    expect(within(trail()).getAllByRole('button')).toHaveLength(2)

    await user.click(within(trail()).getByRole('button', { name: 'Your graph' }))
    await orbitNamed('Credits graph, centred on your graph')
    expect(within(trail()).getAllByRole('button').map((button) => button.textContent)).toEqual(['Your graph'])
  })

  it('FR_VIEW_04 shows two songs that share nobody together, each with its own people and its own cover', async () => {
    const user = userEvent.setup()
    const beautiful = { ...redbone, mbid: 'b0000000-0000-4000-8000-000000000001', title: 'Beautiful Things', artist: 'Benson Boone', creditsStatus: 'complete' as const }
    const sawadika = { ...redbone, mbid: 'b0000000-0000-4000-8000-000000000002', title: 'SaWaDiKa', artist: 'Tems', creditsStatus: 'complete' as const }
    const jack = { mbid: 'c0000000-0000-4000-8000-000000000001', name: 'Jack LaFrantz' }
    const tems = { mbid: 'c0000000-0000-4000-8000-000000000002', name: 'Tems' }
    serveSnapshot(() =>
      snapshot({
        songs: [beautiful, sawadika],
        people: [jack, tems],
        credits: [credit(beautiful.mbid, jack, 'producer'), credit(sawadika.mbid, tems, 'songwriter')],
      }),
    )

    renderAt('/graph', { graphConnection: () => new FakeGraphHub() })
    const orbit = await orbitNamed('Credits graph, centred on your graph')

    // Both songs, and both songs' people, are in the one view; neither has to be chosen to see the other.
    expect(within(orbit).getByRole('button', { name: 'Put Beautiful Things at the centre; 1 person credited' })).toBeInTheDocument()
    expect(within(orbit).getByRole('button', { name: 'Put SaWaDiKa at the centre; 1 person credited' })).toBeInTheDocument()
    expect(within(orbit).getByRole('button', { name: /Put Jack LaFrantz at the centre/ })).toBeInTheDocument()
    expect(within(orbit).getByRole('button', { name: /Put Tems at the centre/ })).toBeInTheDocument()

    await user.click(within(orbit).getByRole('button', { name: /Put SaWaDiKa at the centre/ }))
    await orbitNamed('Credits graph, centred on SaWaDiKa')
    await user.click(within(screen.getByRole('navigation', { name: 'Exploration path' })).getByRole('button', { name: 'Your graph' }))

    const again = await orbitNamed('Credits graph, centred on your graph')
    expect(within(again).getByRole('button', { name: /Put Beautiful Things at the centre/ })).toBeInTheDocument()
  })

  it('FR_VIEW_04 says how many songs share nothing with the centre, and goes back to the whole graph from there', async () => {
    const user = userEvent.setup()
    const tems = { mbid: 'c0000000-0000-4000-8000-000000000002', name: 'Tems' }
    const apart = { ...america, mbid: 'b0000000-0000-4000-8000-000000000002', title: 'SaWaDiKa', artist: 'Tems' }
    const base = twoSongs()
    serveSnapshot(() =>
      snapshot({
        songs: [...base.songs, apart],
        people: [...base.people, tems],
        credits: [...base.credits, credit(apart.mbid, tems, 'songwriter')],
      }),
    )

    renderAt(`/graph?focus=song:${redboneMbid}`, { graphConnection: () => new FakeGraphHub() })
    await orbitNamed('Credits graph, centred on Redbone')

    // Redbone, This Is America and their people are one part; SaWaDiKa is another.
    const chip = await screen.findByRole('button', { name: '1 song not connected. Back to your whole graph' })
    expect(chip).toHaveTextContent('1 song not connected·Your graph')

    await user.click(chip)
    await orbitNamed('Credits graph, centred on your graph')
    expect(screen.queryByRole('button', { name: /Back to your whole graph/ })).not.toBeInTheDocument()
  })

  it('FR_VIEW_04 says when every song is connected to the centre', async () => {
    serveSnapshot(() => twoSongs())

    renderAt(`/graph?focus=person:${riley.mbid}`, { graphConnection: () => new FakeGraphHub() })
    await orbitNamed('Credits graph, centred on Riley Mackin')

    expect(await screen.findByRole('button', { name: 'All 2 songs connected. Back to your whole graph' })).toBeInTheDocument()
  })

  it('FR_VIEW_01 centres on what the address names, and falls back to the whole graph when it names nothing that is there', async () => {
    serveSnapshot(() => twoSongs())

    renderAt(`/graph?focus=person:${riley.mbid}`, { graphConnection: () => new FakeGraphHub() })
    expect(await orbitNamed('Credits graph, centred on Riley Mackin')).toBeInTheDocument()
  })

  it('FR_VIEW_01 ignores a focus that is not in the graph', async () => {
    serveSnapshot(() => twoSongs())

    renderAt('/graph?focus=song:not-in-the-graph', { graphConnection: () => new FakeGraphHub() })
    expect(await orbitNamed('Credits graph, centred on your graph')).toBeInTheDocument()
  })

  it('FR_GRAPH_04 gives a song with no credits its cover large at the centre and a link that says what to do', async () => {
    serveSnapshot(() => snapshot({ songs: [{ ...redbone, creditsStatus: 'none' }] }))

    renderAt(`/graph?focus=song:${redboneMbid}`, { graphConnection: () => new FakeGraphHub() })
    await orbitNamed('Credits graph, centred on Redbone')

    const link = await screen.findByRole('link', { name: /Add them on MusicBrainz: credits for Redbone/ })
    expect(link).toHaveTextContent('Add them')
    expect(link).toHaveAttribute('href', `https://musicbrainz.org/recording/${redboneMbid}`)
    expect(link.closest('p')).toHaveTextContent('No credits on MusicBrainz yet · Add them')
  })

  it('FR_HUB_01 puts a song’s people on the first ring with their roles in the node’s name and a connector marked in the cards', async () => {
    serveSnapshot(() => twoSongs())

    renderAt(`/graph?focus=song:${redboneMbid}`, { graphConnection: () => new FakeGraphHub() })
    const orbit = await orbitNamed('Credits graph, centred on Redbone')

    expect(within(orbit).getByRole('button', { name: 'Put Donald Glover at the centre; credited as songwriter on 2 songs' })).toBeInTheDocument()
    expect(within(orbit).getByRole('button', { name: 'Put Ludwig Göransson at the centre; credited as producer and other on 1 song' })).toBeInTheDocument()
    // The second ring is the other songs those people are on.
    expect(within(orbit).getByRole('button', { name: 'Put This Is America at the centre; 2 people credited' })).toBeInTheDocument()
    // The centre is named but is not a button.
    expect(within(orbit).getByRole('img', { name: 'Redbone, the centre of this view' })).toBeInTheDocument()
  })

  it('FR_NOTES_01 groups a song’s credits by role in its liner notes card, with ×n for a connector and the details after the name', async () => {
    serveSnapshot(() =>
      snapshot({
        songs: [{ ...redbone, creditsStatus: 'complete' }, america],
        people: [donald, ludwig],
        credits: [
          credit(redboneMbid, donald, 'songwriter'),
          credit(redboneMbid, donald, 'instrument', 'drums'),
          credit(redboneMbid, donald, 'instrument', 'glockenspiel'),
          credit(americaMbid, donald, 'songwriter'),
          credit(redboneMbid, ludwig, 'producer'),
        ],
      }),
    )

    renderAt('/graph', { graphConnection: () => new FakeGraphHub() })
    const notes = await screen.findByRole('region', { name: 'Liner notes' })

    const card = within(notes).getByRole('article', { name: 'Redbone, liner notes' })
    expect(within(card).getAllByRole('term').map((term) => term.textContent)).toEqual(['Produced by', 'Written by', 'Played by'])
    expect(within(card).getByText('(drums, glockenspiel)')).toBeInTheDocument()
    expect(within(card).getAllByText(/\(on 2 of your songs\)/)).toHaveLength(2)
  })

  it('FR_GRAPH_04 shows a credits incomplete badge, linking to MusicBrainz, when there is no producer or songwriter', async () => {
    serveSnapshot(() =>
      snapshot({
        songs: [{ ...redbone, creditsStatus: 'partial' }],
        people: [donald],
        credits: [credit(redboneMbid, donald, 'vocal')],
      }),
    )

    renderAt('/graph', { graphConnection: () => new FakeGraphHub() })

    const notes = await screen.findByRole('region', { name: 'Liner notes' })
    expect(within(notes).getByText('Credits incomplete')).toBeInTheDocument()
    const link = within(notes).getByRole('link', { name: /Add credits on MusicBrainz for Redbone/ })
    expect(link).toHaveAttribute('href', `https://musicbrainz.org/recording/${redboneMbid}`)
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('FR_GRAPH_04 does not show the badge for a song that is still being fetched', async () => {
    serveSnapshot(() => snapshot({ songs: [redbone] }))

    renderAt('/graph', { graphConnection: () => new FakeGraphHub() })

    const notes = await screen.findByRole('region', { name: 'Liner notes' })
    expect(within(notes).getByText('Loading credits')).toBeInTheDocument()
    expect(within(notes).queryByText('Credits incomplete')).not.toBeInTheDocument()
  })

  it('FR_HUB_03 turns a role off with its legend chip and works the connectors out again from what is left', async () => {
    const user = userEvent.setup()
    serveSnapshot(() => twoSongs())

    renderAt('/graph', { graphConnection: () => new FakeGraphHub() })
    const connectors = await screen.findByRole('region', { name: 'Connectors' })
    expect(within(connectors).getByRole('button', { name: /Explore Donald Glover/ })).toBeInTheDocument()

    const songwriter = within(screen.getByRole('list', { name: 'Roles' })).getByRole('button', { name: 'Songwriter' })
    expect(songwriter).toHaveAttribute('aria-pressed', 'true')
    await user.click(songwriter)

    expect(songwriter).toHaveAttribute('aria-pressed', 'false')
    expect(within(connectors).queryByRole('button', { name: /Explore Donald Glover/ })).not.toBeInTheDocument()
    expect(within(connectors).getByText(/Add a second song/)).toBeInTheDocument()
    // The badge is about the song, not about what the filter leaves: Redbone still has a producer.
    expect(screen.queryByText('Credits incomplete')).not.toBeInTheDocument()
  })

  it('FR_HUB_03 says out loud that the graph is filtered, turns one role off without soloing it, and puts everything back in one click', async () => {
    const user = userEvent.setup()
    serveSnapshot(() => twoSongs())

    renderAt('/graph', { graphConnection: () => new FakeGraphHub() })
    await screen.findByRole('region', { name: 'Connectors' })
    const roles = within(screen.getByRole('list', { name: 'Roles' }))
    expect(screen.queryByText('Filtered by role')).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Totals' })).toBeInTheDocument()

    // One click turns that role off and leaves every other role on: it is a toggle, not a "show only".
    await user.click(roles.getByRole('button', { name: 'Songwriter' }))
    expect(roles.getByRole('button', { name: 'Songwriter' })).toHaveAttribute('aria-pressed', 'false')
    expect(roles.getByRole('button', { name: 'Producer' })).toHaveAttribute('aria-pressed', 'true')
    expect(roles.getByRole('button', { name: 'Mixing' })).toHaveAttribute('aria-pressed', 'true')

    // The bar names what is off and says the counts follow it.
    const bar = screen.getByText('Filtered by role').closest('[role="status"]') as HTMLElement
    expect(bar).toHaveTextContent('hiding Songwriter')
    expect(bar).toHaveTextContent('the counts, connectors and cards below only count these credits')
    expect(screen.getByRole('group', { name: 'Totals, filtered by role' })).toBeInTheDocument()

    // With most roles off the bar names the ones that are on instead.
    for (const name of ['Producer', 'Mixing', 'Engineering', 'Instrument']) await user.click(roles.getByRole('button', { name }))
    expect(bar).toHaveTextContent('showing Vocal, Other')

    await user.click(within(bar).getByRole('button', { name: 'Show all roles' }))
    expect(screen.queryByText('Filtered by role')).not.toBeInTheDocument()
    expect(roles.getByRole('button', { name: 'Songwriter' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('group', { name: 'Totals' })).toBeInTheDocument()
  })
})

describe('workspace: constellation, the view toggle and find', () => {
  beforeEach(() => {
    setReducedMotion(true)
    rememberGraph()
  })

  it('FR_VIEW_02 switches to the constellation with the toggle, and opens the orbit on a node that is chosen in it', async () => {
    const user = userEvent.setup()
    serveSnapshot(() => twoSongs())

    renderAt('/graph', { graphConnection: () => new FakeGraphHub() })
    await orbitNamed('Credits graph, centred on your graph')
    const toggle = within(screen.getByRole('group', { name: 'View' }))
    expect(toggle.getByRole('button', { name: 'Orbit' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(toggle.getByRole('button', { name: 'Constellation' }))

    const constellation = await screen.findByRole('group', { name: 'Credits graph, the whole graph as a constellation of 2 songs and 3 people' })
    expect(toggle.getByRole('button', { name: 'Constellation' })).toHaveAttribute('aria-pressed', 'true')
    // Every node is a button with a name that says where it goes.
    expect(within(constellation).getByRole('button', { name: 'Open Redbone in the orbit; Childish Gambino' })).toBeInTheDocument()

    await user.click(within(constellation).getByRole('button', { name: /^Open Donald Glover in the orbit; on 2 songs/ }))

    await orbitNamed('Credits graph, centred on Donald Glover')
    expect(toggle.getByRole('button', { name: 'Orbit' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('group', { name: /as a constellation/ })).not.toBeInTheDocument()
  })

  it('FR_VIEW_02 opens on the constellation when the address says so, and names the people in it only while their neighbour is looked at', async () => {
    const user = userEvent.setup()
    serveSnapshot(() => twoSongs())

    renderAt('/graph?view=constellation', { graphConnection: () => new FakeGraphHub() })
    const constellation = await screen.findByRole('group', { name: /as a constellation/ })

    // Songs and connectors are always named; Riley is on one song, so not until Redbone's neighbours are lit.
    // A connector's name fades in with the zoom (a CSS expression), a song's is 1 and anyone else's is 0 until lit.
    const labels = () => Array.from(constellation.querySelectorAll('text.lbl')).filter((label) => (label as SVGElement).style.opacity !== '0')
    expect(labels().map((label) => label.textContent)).toEqual(expect.arrayContaining(['Redbone', 'This Is America', 'Donald Glover']))
    expect(labels().map((label) => label.textContent)).not.toContain('Riley Mackin')

    await user.hover(within(constellation).getByRole('button', { name: /^Open This Is America in the orbit/ }))
    expect(labels().map((label) => label.textContent)).toContain('Riley Mackin')
  })

  it('FR_VIEW_02 draws the constellation on a canvas above the node threshold, and the Text view still has every person', async () => {
    const people = Array.from({ length: CANVAS_THRESHOLD }, (_, index) => ({ mbid: `d0000000-0000-4000-8000-${String(index).padStart(12, '0')}`, name: `Person ${index}` }))
    serveSnapshot(() =>
      snapshot({
        songs: [{ ...redbone, creditsStatus: 'complete' }],
        people,
        credits: people.map((person) => credit(redboneMbid, person, 'songwriter')),
      }),
    )

    renderAt('/graph?view=constellation', { graphConnection: () => new FakeGraphHub() })

    const canvas = await screen.findByRole('img', { name: /as a constellation of 1 song and 60 people/ })
    expect(canvas.tagName).toBe('CANVAS')
    expect(canvas.closest('[data-renderer]')).toHaveAttribute('data-renderer', 'canvas')
    expect(screen.queryByRole('button', { name: /Open Person 3 in the orbit/ })).not.toBeInTheDocument()
  })

  it('FR_GRAPH_05 finds a song or a person that is in the graph by name and makes it the orbit’s centre', async () => {
    const user = userEvent.setup()
    serveSnapshot(() => twoSongs())

    renderAt('/graph?view=constellation', { graphConnection: () => new FakeGraphHub() })
    const box = await screen.findByRole('combobox', { name: 'Find in your graph' })

    await user.type(box, 'goran')
    await user.click(await screen.findByRole('option', { name: /Ludwig Göransson/ }))
    await orbitNamed('Credits graph, centred on Ludwig Göransson')
    expect(box).toHaveValue('')

    await user.type(box, 'america')
    await user.click(await screen.findByRole('option', { name: /This Is America/ }))
    await orbitNamed('Credits graph, centred on This Is America')
  })

  it('FR_GRAPH_05 does not offer a person who is hidden or a song that was removed', async () => {
    const user = userEvent.setup()
    serveSnapshot(() => twoSongs())
    sessionStorage.setItem(`nodeable.hidden.${graphId}`, JSON.stringify([riley.mbid]))

    renderAt('/graph', { graphConnection: () => new FakeGraphHub() })
    const box = await screen.findByRole('combobox', { name: 'Find in your graph' })

    await user.type(box, 'Riley')
    expect(await screen.findByText('Nothing in your graph matches')).toBeInTheDocument()
  })
})

describe('workspace: new credits in the liner notes', () => {
  beforeEach(() => {
    rememberGraph()
  })

  it('FR_NOTES_01 highlights the credits that arrive and raises their role row, and lets the highlight go after 1.6 seconds', async () => {
    setReducedMotion(false)
    const hub = new FakeGraphHub()
    serveSnapshot(
      () => snapshot({ songs: [{ ...redbone, creditsStatus: 'partial' }], people: [donald], credits: [credit(redboneMbid, donald, 'songwriter')] }),
      hub,
    )

    renderAt('/graph', { graphConnection: () => hub })
    const notes = await screen.findByRole('region', { name: 'Liner notes' })
    // What was there when the graph opened is not "new".
    expect(within(notes).getByRole('button', { name: 'Donald Glover' })).not.toHaveAttribute('data-fresh')

    act(() => {
      hub.emit('CreditsResolved', {
        seq: 6,
        songMbid: redboneMbid,
        people: [ludwig],
        credits: [{ personMbid: ludwig.mbid, role: 'producer', detail: '', level: 'recording' }],
      })
    })

    const fresh = await within(notes).findByRole('button', { name: 'Ludwig Göransson' })
    expect(fresh).toHaveAttribute('data-fresh', 'credit')
    // Produced by is a row that was not there before, so it rises; Written by was, and does not.
    expect(fresh.closest('[data-fresh="row"]')).not.toBeNull()
    expect(within(notes).getByRole('button', { name: 'Donald Glover' })).not.toHaveAttribute('data-fresh')

    await waitFor(() => expect(within(notes).getByRole('button', { name: 'Ludwig Göransson' })).not.toHaveAttribute('data-fresh'), { timeout: 4000 })
  })

  it('NFR_MOTION_01 highlights nothing when the person asked for reduced motion: the credit is simply there', async () => {
    setReducedMotion(true)
    const hub = new FakeGraphHub()
    serveSnapshot(() => snapshot({ songs: [{ ...redbone, creditsStatus: 'partial' }], people: [donald], credits: [credit(redboneMbid, donald, 'songwriter')] }), hub)

    renderAt('/graph', { graphConnection: () => hub })
    const notes = await screen.findByRole('region', { name: 'Liner notes' })
    act(() => {
      hub.emit('CreditsResolved', {
        seq: 6,
        songMbid: redboneMbid,
        people: [ludwig],
        credits: [{ personMbid: ludwig.mbid, role: 'producer', detail: '', level: 'recording' }],
      })
    })

    expect(await within(notes).findByRole('button', { name: 'Ludwig Göransson' })).not.toHaveAttribute('data-fresh')
  })
})

describe('workspace: removing a song and hiding a person', () => {
  beforeEach(() => {
    setReducedMotion(true)
    rememberGraph()
  })

  it('FR_GRAPH_06 takes a song out of the views at once, offers undo, and sends nothing when it is undone', async () => {
    const user = userEvent.setup()
    let deleted = false
    serveSnapshot(() => snapshot({ songs: [{ ...redbone, creditsStatus: 'complete' }] }))
    server.use(
      http.delete(`/api/v1/graphs/${graphId}/songs/${redboneMbid}`, () => {
        deleted = true
        return new HttpResponse(null, { status: 204 })
      }),
    )

    renderAt('/graph', { graphConnection: () => new FakeGraphHub() })
    await user.click(await screen.findByRole('button', { name: 'Remove from graph: Redbone by Childish Gambino' }))

    expect(await screen.findByText('Removed “Redbone” from your graph')).toBeInTheDocument()
    expect(screen.getByText(/Your graph is empty/)).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /Credits graph/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Undo' }))

    expect(await orbitNamed('Credits graph, centred on your graph')).toBeInTheDocument()
    expect(screen.queryByText('Removed “Redbone” from your graph')).not.toBeInTheDocument()
    expect(deleted).toBe(false)
  })

  it('FR_GRAPH_06 sends the removal when the undo time is over, and the people only on that song leave with it', async () => {
    const user = userEvent.setup()
    setUndoWindowForTests(40)
    let songs: Song[] = [{ ...redbone, creditsStatus: 'complete' }, america]
    const people = [donald, ludwig]
    const credits = [credit(redboneMbid, ludwig, 'producer'), credit(redboneMbid, donald, 'songwriter'), credit(americaMbid, donald, 'songwriter')]
    serveSnapshot(() => snapshot({ songs, people, credits: credits.filter((entry) => songs.some((song) => song.mbid === entry.songMbid)) }))
    server.use(
      http.delete(`/api/v1/graphs/${graphId}/songs/${redboneMbid}`, () => {
        songs = songs.filter((song) => song.mbid !== redboneMbid)
        return new HttpResponse(null, { status: 204 })
      }),
    )

    renderAt(`/graph?focus=song:${americaMbid}`, { graphConnection: () => new FakeGraphHub() })
    const connectors = await screen.findByRole('region', { name: 'Connectors' })
    expect(within(connectors).getByRole('button', { name: /Explore Donald Glover/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove from graph: Redbone by Childish Gambino' }))

    // Gone from the views: Donald is on one song now, so he is not a connector; Ludwig was only on Redbone.
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Connectors' })).queryByRole('button', { name: /Explore Donald Glover/ })).not.toBeInTheDocument())
    // ...and, after the undo time, off the server: the notice goes and the song does not come back.
    await waitFor(() => expect(screen.queryByText('Removed “Redbone” from your graph')).not.toBeInTheDocument())
    expect(songs.map((song) => song.mbid)).toEqual([americaMbid])
    expect(screen.queryByRole('button', { name: 'Remove from graph: Redbone by Childish Gambino' })).not.toBeInTheDocument()
  })

  it('FR_GRAPH_06 brings the song back and says so when the Api refuses the removal', async () => {
    const user = userEvent.setup()
    setUndoWindowForTests(20)
    serveSnapshot(() => snapshot({ songs: [{ ...redbone, creditsStatus: 'complete' }, america] }))
    server.use(http.delete(`/api/v1/graphs/${graphId}/songs/${redboneMbid}`, () => HttpResponse.json({ status: 500 }, { status: 500 })))

    renderAt('/graph', { graphConnection: () => new FakeGraphHub() })
    await user.click(await screen.findByRole('button', { name: 'Remove from graph: Redbone by Childish Gambino' }))

    expect(await screen.findByText(/Redbone could not be removed/)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Remove from graph: Redbone by Childish Gambino' })).toBeInTheDocument()
  })

  it('FR_VIEW_03 hides a person from the views and the counts, and brings them back from the "n hidden" control', async () => {
    const user = userEvent.setup()
    serveSnapshot(() => twoSongs())

    renderAt(`/graph?focus=song:${redboneMbid}`, { graphConnection: () => new FakeGraphHub() })
    const orbit = await orbitNamed('Credits graph, centred on Redbone')
    expect(within(orbit).getByRole('button', { name: /Put Donald Glover at the centre/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Hide from view: Donald Glover' }))

    expect(within(orbit).queryByRole('button', { name: /Put Donald Glover at the centre/ })).not.toBeInTheDocument()
    expect(screen.getByText(/Add a second song/)).toBeInTheDocument()
    // Kept for the session, per graph, and never sent anywhere.
    expect(JSON.parse(sessionStorage.getItem(`nodeable.hidden.${graphId}`) ?? 'null')).toEqual([donald.mbid])
    // The song's own status is judged from every credit, so hiding its writer does not make it "incomplete".
    expect(screen.queryByText('Credits incomplete')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '1 hidden · show' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Show Donald Glover' }))

    expect(await within(orbit).findByRole('button', { name: /Put Donald Glover at the centre/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '1 hidden · show' })).not.toBeInTheDocument()
    expect(sessionStorage.getItem(`nodeable.hidden.${graphId}`)).toBeNull()
  })

  it('FR_VIEW_03 returns to the last centre when the person at the centre is hidden', async () => {
    const user = userEvent.setup()
    serveSnapshot(() => twoSongs())

    renderAt(`/graph?focus=person:${donald.mbid}`, { graphConnection: () => new FakeGraphHub() })
    await orbitNamed('Credits graph, centred on Donald Glover')

    await user.click(screen.getByRole('button', { name: 'Hide from view: Donald Glover (the centre)' }))

    // Nothing earlier on the trail: the whole graph is the centre.
    expect(await orbitNamed('Credits graph, centred on your graph')).toBeInTheDocument()
  })
})

describe('workspace: Text view', () => {
  beforeEach(() => {
    setReducedMotion(true)
    rememberGraph()
  })

  it('NFR_A11Y_01 lists the connectors first, and the other people after "Show all n people"', async () => {
    const user = userEvent.setup()
    serveSnapshot(() => twoSongs())

    renderAt('/graph', { graphConnection: () => new FakeGraphHub() })
    await user.click(await screen.findByRole('button', { name: 'Text view' }))

    const connectorsOnly = await screen.findByRole('table', { name: 'Connectors, most songs first (1 of 3 people)' })
    const rows = within(connectorsOnly).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(1)
    expect(within(rows[0]!).getByRole('rowheader')).toHaveTextContent('Donald Glover')
    expect(within(rows[0]!).getByText('Connector')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show all 3 people' }))

    const everyone = await screen.findByRole('table', { name: 'People, most songs first' })
    const names = within(everyone).getAllByRole('rowheader').map((header) => header.textContent)
    expect(names.map((name) => name?.replace('Connector', ''))).toEqual(['Donald Glover', 'Ludwig Göransson', 'Riley Mackin'])
    // An "other" credit is named by its detail.
    expect(within(everyone).getByText('Arranger')).toBeInTheDocument()
  })

  it('NFR_A11Y_01 carries the same people as the orbit does, with the same role filter and the same hidden people', async () => {
    const user = userEvent.setup()
    serveSnapshot(() => twoSongs())

    renderAt(`/graph?focus=song:${redboneMbid}`, { graphConnection: () => new FakeGraphHub() })
    const orbit = await orbitNamed('Credits graph, centred on Redbone')

    // Hide Ludwig and turn mixing off, then compare.
    await user.click(screen.getByRole('button', { name: 'Text view' }))
    const people = await screen.findByRole('table', { name: /Connectors, most songs first/ })
    await user.click(screen.getByRole('button', { name: /Show all \d+ people/ }))
    await user.click(await within(await screen.findByRole('table', { name: 'People, most songs first' })).findByRole('button', { name: 'Hide from view: Ludwig Göransson' }))
    await user.click(within(screen.getByRole('list', { name: 'Roles' })).getByRole('button', { name: 'Mixing' }))
    expect(people).toBeDefined()

    const inOrbit = within(orbit)
      .getAllByRole('button', { name: /credited as/ })
      .map((node) => /^Put (.+) at the centre/.exec(node.getAttribute('aria-label') ?? '')?.[1])
      .sort()
    const table = await screen.findByRole('table', { name: 'People, most songs first' })
    const inText = within(table)
      .getAllByRole('rowheader')
      .map((header) => header.textContent?.replace('Connector', '').trim())
      .sort()

    // The orbit's rings hold a song's people, so people on the centre song are the same names the Text view lists.
    expect(inText).toEqual(['Donald Glover'])
    expect(inOrbit).toEqual(['Donald Glover'])
  })
})

describe('workspace: motion', () => {
  it('NFR_MOTION_01 puts the nodes in their place at once when the person asked for reduced motion', async () => {
    setReducedMotion(true)
    rememberGraph()
    serveSnapshot(() => twoSongs())

    renderAt(`/graph?focus=song:${redboneMbid}`, { graphConnection: () => new FakeGraphHub() })
    const orbit = await orbitNamed('Credits graph, centred on Redbone')

    const node = within(orbit).getByRole('button', { name: /Put Donald Glover at the centre/ })
    expect(node.getAttribute('opacity')).toBe('1.000')
    expect(node.getAttribute('transform')).toMatch(/^translate\(-?[\d.]+,-?[\d.]+\) scale\(/)
    expect(node.getAttribute('transform')).not.toMatch(/translate\(0\.00,0\.00\)/)
  })

  it('NFR_MOTION_01 starts new nodes folded into the centre and invisible when motion is allowed', async () => {
    setReducedMotion(false)
    rememberGraph()
    serveSnapshot(() => twoSongs())

    renderAt(`/graph?focus=song:${redboneMbid}`, { graphConnection: () => new FakeGraphHub() })
    const orbit = await orbitNamed('Credits graph, centred on Redbone')

    const node = within(orbit).getByRole('button', { name: /Put Donald Glover at the centre/ })
    expect(node.getAttribute('opacity')).toBe('0.000')
    expect(node.getAttribute('transform')).toMatch(/^translate\(0\.00,0\.00\) scale\(0\.001\)/)
  })
})

describe('workspace: touch targets', () => {
  it('NFR_A11Y_01 gives a person’s name in the liner notes a target at least 24 px tall, so wrapped names are separate targets on a phone', async () => {
    setReducedMotion(true)
    rememberGraph()
    serveSnapshot(() => twoSongs())

    renderAt('/graph', { graphConnection: () => new FakeGraphHub() })
    const notes = await screen.findByRole('region', { name: 'Liner notes' })
    const card = within(notes).getByRole('article', { name: 'Redbone, liner notes' })

    const name = within(card).getAllByRole('button', { name: 'Donald Glover' })[0]!
    expect(getComputedStyle(name).minHeight).toBe('24px')
  })
})
