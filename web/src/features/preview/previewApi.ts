import { apiClient } from '../../api/client.ts'
import type { components } from '../../api/schema'

export type PreviewCandidate = components['schemas']['PreviewCandidateItem']

/** A request about a preview that the Api refused or could not complete. `status` is the HTTP status (0 for a network failure). */
export class PreviewRequestError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`The preview request failed with HTTP ${status}`)
    this.name = 'PreviewRequestError'
    this.status = status
  }
}

/** Deezer's first results for the recording that have a preview (FR-PREVIEW-01, decision 0026). */
export async function fetchPreviewCandidates(recordingMbid: string, signal?: AbortSignal): Promise<PreviewCandidate[]> {
  const { data, response } = await apiClient.GET('/api/v1/recordings/{mbid}/preview/candidates', {
    params: { path: { mbid: recordingMbid } },
    signal,
  })
  if (data === undefined) throw new PreviewRequestError(response.status)
  return data.candidates
}

/** Stores the person's choice. Resolves when the Api accepted it; the graph learns of it through `PreviewFound`. */
export async function pickPreviewCandidate(recordingMbid: string, trackId: string): Promise<void> {
  const { data, response } = await apiClient.POST('/api/v1/recordings/{mbid}/preview/pick', {
    params: { path: { mbid: recordingMbid } },
    body: { trackId },
  })
  if (data === undefined) throw new PreviewRequestError(response.status)
}
