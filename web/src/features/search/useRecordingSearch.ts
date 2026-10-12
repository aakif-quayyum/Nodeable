import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../../api/client.ts'

/** Titles shorter than this are refused by the Api (400), so the form never sends them. */
export const MIN_QUERY_LENGTH = 2

/**
 * A search the Api answered with an error. `status` is the HTTP status; `retryAfterSeconds` is the Api's advice
 * on when to try again (Retry-After), when it gave one.
 */
export class SearchError extends Error {
  readonly status: number
  readonly retryAfterSeconds: number | null

  constructor(status: number, retryAfterSeconds: number | null) {
    super(`Search failed with HTTP ${status}`)
    this.name = 'SearchError'
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
}

function readRetryAfter(response: Response): number | null {
  const seconds = Number(response.headers.get('retry-after'))
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null
}

export function useRecordingSearch(title: string, artist: string | undefined) {
  return useQuery({
    // LEARN: LG-03 query-key-deps | The query key works like a useEffect dependency array that is also the cache address: a new title or artist is a new key, so TanStack Query fetches (or serves from cache) by itself and never shows the answer to the previous search
    queryKey: ['search', 'recordings', { title, artist: artist ?? null }],

    queryFn: async ({ signal }) => {
      const { data, response } = await apiClient.GET('/api/v1/search/recordings', {
        params: { query: { q: title, artist } },
        signal,
      })

      // openapi-fetch returns HTTP errors instead of throwing; TanStack Query needs a throw to enter its error state.
      if (data === undefined) {
        throw new SearchError(response.status, readRetryAfter(response))
      }

      return data
    },

    // A busy search or a busy MusicBrainz will not be fixed by asking again at once, and each ask costs a slot of the
    // shared rate budget. The person decides when to retry, with the button.
    retry: (failureCount, error) => !(error instanceof SearchError) && failureCount < 1,

    // The same search a minute later gives the same answer; the Api's own cache and the 1 request per second limit
    // make a repeat costly, so keep it for a while.
    staleTime: 5 * 60_000,
  })
}
