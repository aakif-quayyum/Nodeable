# 0004. The browser talks only to its own origin: `/api` and `/otlp` are proxied

- **Status:** Accepted
- **Date:** 2026-10-11
- **Spec:** section 11 (browser traces with `traceparent`), section 12 (frontend), section 13 (Caddy in production), NFR-OBS-01, NFR-SEC-01

## Context

The browser calls the Api and, for tracing, sends spans to an OpenTelemetry endpoint. Both live on other origins locally (random ports under Aspire) and in production (the Api and the Collector). Calling them cross-origin needs CORS rules on each, including allowing the `traceparent` header, and the browser would have to know where telemetry goes.

## Decision

- The web app makes **same-origin** requests only: API calls go to `/api/...` and spans go to `/otlp/v1/traces`.
- In development **Vite's dev server proxies** `/api` to the Api and `/otlp` to the Aspire dashboard's OTLP/HTTP endpoint. The targets come from environment variables Aspire injects (`services__api__http__0`, `OTEL_EXPORTER_OTLP_ENDPOINT`), with fallbacks for running `npm run dev` on its own.
- In production **Caddy** does the same job (section 13): it serves the static files and proxies `/api` and `/otlp`.
- The API client looks up `fetch` on every call (`(request) => globalThis.fetch(request)`), so requests still pass through the tracing instrumentation that is installed after first paint (decision 0002).

## Alternatives considered

| Option | Why it lost |
| --- | --- |
| Call the Api and the dashboard cross-origin with CORS | More configuration in two places, a per-run random origin to allow, and the dashboard's OTLP endpoint would need CORS and possibly an API key in browser code. |
| Proxy only `/api` and send telemetry cross-origin | Solves half of the problem and leaves the harder half. |

## Consequences

- No CORS configuration anywhere, and `traceparent` travels same-origin by default.
- The browser never learns where telemetry is collected, so production can change the backend without a frontend release.
- A client created before tracing starts must not capture `globalThis.fetch` early. `openapi-fetch` does by default, so the wrapper in `web/src/api/client.ts` is load-bearing and is covered by a test.
- Vite's proxy only exists in development; the production proxy rules must be added to the Caddyfile in M4.
