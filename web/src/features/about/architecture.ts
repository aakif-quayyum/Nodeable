// The architecture of spec section 7 as data: the figure and the list under it are both drawn from this, so they cannot
// disagree (NFR-A11Y-01). Coordinates are in the figure's own units (viewBox 0 0 960 420).

export interface Box {
  id: string
  x: number
  y: number
  w: number
  h: number
  /** One to three short lines inside the box; the first is the name. */
  lines: string[]
}

export interface Group {
  title: string
  x: number
  y: number
  w: number
  h: number
}

export type EdgeKind = 'request' | 'telemetry'

export interface Edge {
  n: number
  kind: EdgeKind
  /** An SVG path from the edge of one box to the edge of another. */
  path: string
  /** Where the number sits on the line. */
  at: [number, number]
  /** The whole fact, in words. */
  sentence: string
}

export const groups: Group[] = [
  { title: 'Shared stores', x: 640, y: 10, w: 300, h: 150 },
  { title: 'Other people’s APIs', x: 640, y: 190, w: 300, h: 130 },
]

export const boxes: Box[] = [
  { id: 'browser', x: 10, y: 95, w: 120, h: 80, lines: ['Browser', 'React app', 'live updates'] },
  { id: 'caddy', x: 190, y: 95, w: 110, h: 80, lines: ['Caddy', 'HTTPS, routes', '/api /hubs /otlp'] },
  { id: 'api', x: 360, y: 30, w: 170, h: 90, lines: ['Api', 'ASP.NET Core', 'queues work, answers', 'search itself'] },
  { id: 'worker', x: 360, y: 200, w: 170, h: 90, lines: ['Worker', 'crawl queue,', 'scheduled jobs,', 'metrics rollup'] },
  { id: 'postgres', x: 655, y: 50, w: 130, h: 90, lines: ['PostgreSQL', 'cache, job queue,', 'metrics rollup'] },
  { id: 'redis', x: 795, y: 50, w: 130, h: 90, lines: ['Redis', 'shared rate gate,', 'live-update relay'] },
  { id: 'musicbrainz', x: 655, y: 230, w: 130, h: 70, lines: ['MusicBrainz', 'credits'] },
  { id: 'deezer', x: 795, y: 230, w: 130, h: 70, lines: ['Deezer', 'previews'] },
  { id: 'aspire', x: 360, y: 340, w: 170, h: 60, lines: ['Aspire Dashboard', 'traces'] },
]

export const edges: Edge[] = [
  {
    n: 1,
    kind: 'request',
    path: 'M130 135 H190',
    at: [160, 120],
    sentence: 'The browser talks only to its own address: HTTPS for pages and the API, and a WebSocket for live updates.',
  },
  { n: 2, kind: 'request', path: 'M300 135 H330 V75 H360', at: [330, 105], sentence: 'Caddy sends /api and /hubs to the Api.' },
  {
    n: 3,
    kind: 'request',
    path: 'M530 60 H640',
    at: [585, 48],
    sentence: 'The Api reads the cache and queues jobs in PostgreSQL, and uses Redis for the rate gate and to relay live updates.',
  },
  {
    n: 4,
    kind: 'request',
    path: 'M530 230 H590 V110 H640',
    at: [590, 170],
    sentence: 'The Worker claims jobs and stores credits in PostgreSQL, and takes its turn at the rate gate in Redis.',
  },
  {
    n: 5,
    kind: 'request',
    path: 'M530 95 H610 V245 H640',
    at: [610, 205],
    sentence: 'A search asks MusicBrainz in the same request, and playing a song asks Deezer for a fresh preview link. MusicBrainz is asked through the shared rate gate, Deezer through its own.',
  },
  {
    n: 6,
    kind: 'request',
    path: 'M530 275 H640',
    at: [585, 263],
    sentence: 'The Worker makes every other fetch: credits from MusicBrainz, previews from Deezer. Every MusicBrainz request, from either process, passes one shared rate gate.',
  },
  {
    n: 7,
    kind: 'telemetry',
    path: 'M375 120 V160 H345 V355 H360',
    at: [345, 260],
    sentence: 'The Api sends its traces and logs to the Aspire Dashboard.',
  },
  { n: 8, kind: 'telemetry', path: 'M445 290 V340', at: [445, 315], sentence: 'The Worker sends its traces and logs to the Aspire Dashboard.' },
  {
    n: 9,
    kind: 'telemetry',
    path: 'M245 175 V380 H360',
    at: [245, 290],
    sentence: 'The browser’s traces go to /otlp on Caddy, which passes them straight on to the Aspire Dashboard.',
  },
]
