import { apiClient } from '../../api/client.ts'
import type { MetricsResponse, Range, ZoomWindow } from './statusModel.ts'

/** The Api refused the private metrics: 401 is a wrong or missing password, 429 is too many requests. */
export class StatusRequestError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`The status request failed with HTTP ${status}`)
    this.name = 'StatusRequestError'
    this.status = status
  }
}

/** The user the private endpoints expect (decision 0023). */
export const operatorUser = 'operator'

/** `Authorization: Basic` for the operator, built from UTF-8 bytes so a password with accents or symbols works. */
export function basicAuthorization(password: string): string {
  const bytes = new TextEncoder().encode(`${operatorUser}:${password}`)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `Basic ${btoa(binary)}`
}

export interface StatusQuery {
  range: Range
  /** A dragged window; when present it replaces the range. */
  zoom: ZoomWindow | null
  /** How many points the chart can draw: the Api cuts the window into at most this many steps. */
  width: number
}

export async function fetchPrivateMetrics(password: string, query: StatusQuery, signal?: AbortSignal): Promise<MetricsResponse> {
  const { data, response } = await apiClient.GET('/api/v1/status/private/metrics', {
    params: { query: { range: query.zoom === null ? query.range : undefined, from: query.zoom?.from, to: query.zoom?.to, width: query.width } },
    headers: { Authorization: basicAuthorization(password) },
    signal,
  })
  if (data === undefined) throw new StatusRequestError(response.status)
  return data
}
