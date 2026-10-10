import createClient from 'openapi-fetch'
import type { paths } from './schema'

export function createApiClient(baseUrl: string = window.location.origin) {
  return createClient<paths>({
    baseUrl,

    // LEARN: LG-01 late-bound-fetch | openapi-fetch copies globalThis.fetch when the client is created, but tracing replaces globalThis.fetch after first paint (ADR 0002); looking it up on every call means requests made by an already-created client still pass through the instrumentation and carry a traceparent header
    fetch: (request) => globalThis.fetch(request),
  })
}

// The browser talks to its own origin: in development Vite proxies /api to the Api, in production Caddy does (spec section 13).
export const apiClient = createApiClient()
