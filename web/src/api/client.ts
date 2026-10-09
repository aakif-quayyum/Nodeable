import createClient from 'openapi-fetch'
import type { paths } from './schema'

// LEARN: LG-01 typed-client | createClient<paths> is generic over the generated `paths` type, so GET('/api/v1/status/crawl') is checked against the Api's real OpenAPI contract: a wrong path, a missing parameter or a misread response field is a compile error (spec principle 6)
export function createApiClient(baseUrl: string = window.location.origin) {
  return createClient<paths>({ baseUrl })
}

// The browser talks to its own origin: in development Vite proxies /api to the Api, in production Caddy does (spec section 13).
export const apiClient = createApiClient()
