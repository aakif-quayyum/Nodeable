import { apiClient } from '../../api/client.ts'
import type { components } from '../../api/schema'
import { clearGraphSession, readGraphSession, saveGraphSession, type GraphSession } from './graphSession.ts'

export type GraphSnapshotResponse = components['schemas']['GraphSnapshot']
export type AddSongResponse = components['schemas']['AddSongResponse']

/** The address of a graph in the query cache. Everything the page knows about one graph lives under it. */
export function graphQueryKey(graphId: string) {
  return ['graph', graphId] as const
}

/**
 * A graph request the Api refused. `status` is the HTTP status; `retryAfterSeconds` is the Api's advice on when to
 * try again (Retry-After), when it gave one.
 */
export class GraphRequestError extends Error {
  readonly status: number
  readonly retryAfterSeconds: number | null

  constructor(status: number, retryAfterSeconds: number | null) {
    super(`The graph request failed with HTTP ${status}`)
    this.name = 'GraphRequestError'
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
}

function failure(response: Response): GraphRequestError {
  const seconds = Number(response.headers.get('retry-after'))
  return new GraphRequestError(response.status, Number.isFinite(seconds) && seconds > 0 ? seconds : null)
}

/**
 * A 401 or a 404 on a graph this browser remembers means the graph is gone for good (the database was reset, or the
 * token is not the one the server holds): forget it, so the person starts a new one instead of seeing errors forever.
 */
function forgetIfGone(error: GraphRequestError, session: GraphSession): GraphRequestError {
  if ((error.status === 401 || error.status === 404) && readGraphSession()?.id === session.id) {
    clearGraphSession()
  }
  return error
}

export async function fetchGraphSnapshot(session: GraphSession, signal?: AbortSignal): Promise<GraphSnapshotResponse> {
  const { data, response } = await apiClient.GET('/api/v1/graphs/{id}', {
    params: { path: { id: session.id }, header: { 'X-Graph-Token': session.token } },
    signal,
  })

  if (data === undefined) {
    throw forgetIfGone(failure(response), session)
  }
  return data
}

// Two songs added in quick succession must share one new graph. The promise is kept while the request is in flight,
// so the second caller waits for the first one's graph instead of creating another.
let creating: Promise<GraphSession> | null = null

/** The browser's graph, created (and remembered) on first use. */
export function ensureGraphSession(): Promise<GraphSession> {
  const existing = readGraphSession()
  if (existing !== null) {
    return Promise.resolve(existing)
  }

  creating ??= (async () => {
    try {
      const { data, response } = await apiClient.POST('/api/v1/graphs', { body: { name: null } })
      if (data === undefined) {
        throw failure(response)
      }

      // The token is shown once by the server (decision 0007): this is the only place it is ever held.
      const session = { id: data.id, token: data.anonToken }
      saveGraphSession(session)
      return session
    } finally {
      creating = null
    }
  })()

  return creating
}

export async function addSongToGraph(session: GraphSession, recordingMbid: string): Promise<AddSongResponse> {
  const { data, response } = await apiClient.POST('/api/v1/graphs/{id}/songs', {
    params: { path: { id: session.id }, header: { 'X-Graph-Token': session.token } },
    body: { recordingMbid },
  })

  if (data === undefined) {
    throw forgetIfGone(failure(response), session)
  }
  return data
}

export async function removeSongFromGraph(session: GraphSession, songMbid: string): Promise<void> {
  const { response } = await apiClient.DELETE('/api/v1/graphs/{id}/songs/{mbid}', {
    params: { path: { id: session.id, mbid: songMbid }, header: { 'X-Graph-Token': session.token } },
  })

  if (!response.ok) {
    throw forgetIfGone(failure(response), session)
  }
}
