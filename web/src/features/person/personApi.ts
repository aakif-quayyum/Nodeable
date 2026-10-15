import { apiClient } from '../../api/client.ts'
import type { components } from '../../api/schema'

export type PersonProfile = components['schemas']['PersonProfile']
export type PersonRecordingsPage = components['schemas']['PersonRecordingsPage']
export type PersonRecording = components['schemas']['PersonRecordingItem']

/** How many credited recordings one page holds. The drawer asks for more on request. */
export const recordingsPageSize = 20

/** A person request the Api refused. `status` is the HTTP status; 404 means Nodeable has not stored the person. */
export class PersonRequestError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`The person request failed with HTTP ${status}`)
    this.name = 'PersonRequestError'
    this.status = status
  }
}

export async function fetchPerson(personMbid: string, signal?: AbortSignal): Promise<PersonProfile> {
  const { data, response } = await apiClient.GET('/api/v1/people/{mbid}', { params: { path: { mbid: personMbid } }, signal })
  if (data === undefined) throw new PersonRequestError(response.status)
  return data
}

export async function fetchPersonRecordings(personMbid: string, page: number, signal?: AbortSignal): Promise<PersonRecordingsPage> {
  const { data, response } = await apiClient.GET('/api/v1/people/{mbid}/recordings', {
    params: { path: { mbid: personMbid }, query: { page, pageSize: recordingsPageSize } },
    signal,
  })
  if (data === undefined) throw new PersonRequestError(response.status)
  return data
}
