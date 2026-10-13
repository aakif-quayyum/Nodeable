import type { Page, Route, WebSocketRoute } from '@playwright/test'

/**
 * The Api and the hub, as far as the browser can tell, answered at the network edge with `page.route` and
 * `page.routeWebSocket`. The page under test is the real production build: its fetch calls, its SignalR client and its
 * rendering are all real; only the server is a stand-in (spec section 13).
 */
export const graphId = '7c1e0000-0000-4000-8000-000000000000'
export const redboneMbid = '7408f11c-6c4e-41e5-b81b-6a15bf6cb268'

export const donald = { mbid: '1ba09d36-5d9d-4a23-8b52-2f2e4d5b1b11', name: 'Donald Glover' }
export const ludwig = { mbid: '9a7f3a5e-1d0f-4d1a-93f2-6e0a91b6f4c2', name: 'Ludwig Göransson' }

interface Song {
  mbid: string
  title: string
  artist: string
  year: number
  creditsStatus: 'loading' | 'complete'
  addedAt: string
}

interface Credit {
  songMbid: string
  personMbid: string
  role: string
  detail: string
  level: 'recording'
}

const redbone: Song = {
  mbid: redboneMbid,
  title: 'Redbone',
  artist: 'Childish Gambino',
  year: 2016,
  creditsStatus: 'loading',
  addedAt: '2026-10-13T09:00:00Z',
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

/** The SignalR JSON protocol ends every message with the record separator. */
const separator = '\x1e'

export interface FakeServer {
  /** Pushes a hub event to the page, as the server would. */
  push: (target: string, payload: object) => void
  /** Songs the fake Api holds now. */
  songs: () => Song[]
}

/** Installs the fake Api and hub on a page. Call before the page navigates. */
export async function installFakeServer(page: Page): Promise<FakeServer> {
  let songs: Song[] = []
  let credits: Credit[] = []
  let seq = 0
  let socket: WebSocketRoute | null = null

  await page.route('**/api/v1/search/recordings*', (route) =>
    json(route, {
      source: 'musicBrainz',
      results: [
        {
          mbid: redboneMbid,
          title: 'Redbone',
          artist: 'Childish Gambino',
          firstReleaseTitle: 'Awaken, My Love!',
          year: 2016,
          score: 100,
          creditsStatus: null,
          kind: null,
          versions: [],
        },
      ],
    }),
  )

  await page.route('**/api/v1/graphs', (route) =>
    route.request().method() === 'POST' ? json(route, { id: graphId, name: 'Untitled graph', anonToken: 'token-for-e2e' }, 201) : route.fallback(),
  )

  await page.route(`**/api/v1/graphs/${graphId}`, (route) =>
    json(route, {
      id: graphId,
      name: 'Untitled graph',
      seq,
      songs,
      people: [donald, ludwig].filter((person) => credits.some((credit) => credit.personMbid === person.mbid)),
      credits,
      hubs: [],
      crawl: { queued: 0, done: 0, failed: 0, etaSeconds: 0 },
    }),
  )

  await page.route(`**/api/v1/graphs/${graphId}/songs`, (route) => {
    songs = [redbone]
    return json(route, { song: redbone, pendingJobs: 1 }, 202)
  })

  await page.route(`**/api/v1/graphs/${graphId}/songs/${redboneMbid}`, (route) => {
    songs = []
    credits = []
    return route.fulfill({ status: 204 })
  })

  // SignalR negotiates over HTTP, then upgrades to a WebSocket; both are answered here.
  await page.route('**/hubs/graph/negotiate*', (route) =>
    json(route, {
      negotiateVersion: 1,
      connectionId: 'e2e-connection',
      connectionToken: 'e2e-token',
      availableTransports: [{ transport: 'WebSockets', transferFormats: ['Text', 'Binary'] }],
    }),
  )

  await page.routeWebSocket(/\/hubs\/graph/, (ws) => {
    socket = ws
    // The client gives up on a server that is silent for 30 seconds; a real hub pings, so this one does.
    const keepAlive = setInterval(() => ws.send(`{"type":6}${separator}`), 10_000)
    ws.onClose(() => clearInterval(keepAlive))
    ws.onMessage((message) => {
      const text = typeof message === 'string' ? message : message.toString()
      for (const frame of text.split(separator).filter((part) => part !== '')) {
        const data = JSON.parse(frame) as { protocol?: string; type?: number; target?: string; invocationId?: string }
        if (data.protocol !== undefined) {
          // The handshake: the server accepts the protocol with an empty object.
          ws.send(`{}${separator}`)
        } else if (data.type === 1 && data.invocationId !== undefined) {
          // An invocation (JoinGraph) is answered with a completion carrying its invocation id.
          ws.send(`${JSON.stringify({ type: 3, invocationId: data.invocationId })}${separator}`)
        }
      }
    })
  })

  return {
    songs: () => songs,
    push: (target, payload) => {
      if (socket === null) throw new Error('The page has not connected to the hub yet')
      seq += 1
      const message = { ...payload, seq }
      if (target === 'CreditsResolved') {
        const event = payload as { songMbid: string; credits: { personMbid: string; role: string; detail: string }[] }
        credits = [...credits, ...event.credits.map((credit) => ({ ...credit, songMbid: event.songMbid, level: 'recording' as const }))]
      }
      if (target === 'SongStatusChanged') songs = songs.map((song) => ({ ...song, creditsStatus: 'complete' }))
      socket.send(`${JSON.stringify({ type: 1, target, arguments: [message] })}${separator}`)
    },
  }
}
