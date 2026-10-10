import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-web'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '../api/client.ts'
import { crawlStatusFixture } from '../test/handlers.ts'
import { server } from '../test/server.ts'
import { afterFirstPaint } from './afterFirstPaint.ts'
import { startTracing, type Tracing } from './tracing.ts'

describe('browser tracing', () => {
  let tracing: Tracing | undefined

  afterEach(async () => {
    await tracing?.shutdown()
    tracing = undefined
  })

  // `apiClient` was created when this file imported it, before startTracing ran: the same order as the app, where
  // tracing starts after first paint. If the client had captured the original fetch, no traceparent would be sent.
  it('NFR_OBS_01 sends a traceparent header on Api requests made by a client created before tracing started', async () => {
    const exporter = new InMemorySpanExporter()
    tracing = startTracing(exporter)

    let traceparent: string | null = null
    server.use(
      http.get('/api/v1/status/crawl', ({ request }) => {
        traceparent = request.headers.get('traceparent')
        return HttpResponse.json(crawlStatusFixture)
      }),
    )

    await apiClient.GET('/api/v1/status/crawl')

    // Format: version-traceId-parentSpanId-flags (W3C Trace Context), the value the Api's server span continues from.
    expect(traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/)

    // The instrumentation ends its span shortly after the response (it waits for the browser's resource timing), and
    // the batch processor only hands spans to the exporter when flushed, so flush on every attempt until the span arrives.
    const tracingInUse = tracing
    await vi.waitFor(async () => {
      await tracingInUse.forceFlush()
      expect(exporter.getFinishedSpans()).toHaveLength(1)
    })
    const [span] = exporter.getFinishedSpans()
    expect(span?.resource.attributes['service.name']).toBe('nodeable-web')
    expect(traceparent).toContain(span?.spanContext().traceId ?? 'no span was exported')
  })

  it('NFR_OBS_01 does not trace the exporter\'s own requests to /otlp', async () => {
    const exporter = new InMemorySpanExporter()
    tracing = startTracing(exporter)
    server.use(http.post('/otlp/v1/traces', () => new HttpResponse(null, { status: 200 })))

    await fetch('/otlp/v1/traces', { method: 'POST', body: '{}' })
    await tracing.forceFlush()

    expect(exporter.getFinishedSpans()).toHaveLength(0)
  })
})

describe('afterFirstPaint', () => {
  it('NFR_PERF_04 runs its callback after the next animation frame, not synchronously', async () => {
    vi.useFakeTimers()
    const callback = vi.fn()

    afterFirstPaint(callback)
    expect(callback).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(50)
    expect(callback).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })
})
