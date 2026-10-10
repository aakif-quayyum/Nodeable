import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { registerInstrumentations } from '@opentelemetry/instrumentation'
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { BatchSpanProcessor, WebTracerProvider, type SpanExporter } from '@opentelemetry/sdk-trace-web'

// Same-origin on purpose: Vite proxies /otlp to the Aspire dashboard in development and Caddy will proxy it to the
// OpenTelemetry Collector in production, so the browser needs no CORS rules and never learns where telemetry goes.
const OTLP_TRACES_URL = '/otlp/v1/traces'

export interface Tracing {
  /** Sends any finished spans now instead of waiting for the batch timer. */
  forceFlush: () => Promise<void>
  /** Stops instrumenting fetch and flushes what is left. */
  shutdown: () => Promise<void>
}

// LEARN: LG-01 otel-web-sdk | The browser SDK has the same three parts as the server: a provider that creates spans, an exporter that ships them over OTLP/HTTP, and instrumentation that creates spans for you (here, every fetch) and adds the W3C traceparent header so the Api's span becomes a child of the browser's
export function startTracing(exporter: SpanExporter = new OTLPTraceExporter({ url: OTLP_TRACES_URL })): Tracing {
  const provider = new WebTracerProvider({
    resource: resourceFromAttributes({ 'service.name': 'nodeable-web' }),
    // Batching keeps the browser from sending one network request per span.
    spanProcessors: [new BatchSpanProcessor(exporter)],
  })
  provider.register()

  const unregisterInstrumentations = registerInstrumentations({
    tracerProvider: provider,
    // The exporter's own POSTs to /otlp must not be traced, or every export would create a span that needs exporting.
    instrumentations: [new FetchInstrumentation({ ignoreUrls: [/\/otlp\//] })],
  })

  return {
    forceFlush: () => provider.forceFlush(),
    shutdown: async () => {
      unregisterInstrumentations()
      await provider.shutdown()
    },
  }
}
