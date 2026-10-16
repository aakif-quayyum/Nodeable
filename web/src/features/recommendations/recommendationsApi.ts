import { apiClient } from '../../api/client.ts'
import type { components } from '../../api/schema'
import type { GraphSession } from '../graph/graphSession.ts'

export type Recommendation = components['schemas']['RecommendationItem']

/** How many recommendations the list asks for. The Api allows up to 50; a longer list would bury the cards above it. */
export const recommendationLimit = 10

/** A recommendations request the Api refused. `status` is the HTTP status (429 means too many requests). */
export class RecommendationsRequestError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`The recommendations request failed with HTTP ${status}`)
    this.name = 'RecommendationsRequestError'
    this.status = status
  }
}

export async function fetchRecommendations(session: GraphSession, signal?: AbortSignal): Promise<Recommendation[]> {
  const { data, response } = await apiClient.GET('/api/v1/graphs/{id}/recommendations', {
    params: { path: { id: session.id }, query: { limit: recommendationLimit }, header: { 'X-Graph-Token': session.token } },
    signal,
  })
  if (data === undefined) throw new RecommendationsRequestError(response.status)
  return data.items
}
