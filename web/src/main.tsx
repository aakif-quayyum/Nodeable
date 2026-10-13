import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App.tsx'
import { afterFirstPaint } from './telemetry/afterFirstPaint.ts'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// LEARN: LG-01 deferred-import | A dynamic import() becomes its own JavaScript chunk that is downloaded only when this line runs, so the OpenTelemetry SDK is kept out of the main bundle and loaded after first paint (ADR 0002); requests made before it arrives are not traced
// Self-hosted variable fonts (decision 0020). They are requested after the first paint, like telemetry: the page is
// readable in the system fonts at once and the faces swap in when they arrive. A font declared up front is a request the
// first paint is measured against (it moved the largest contentful paint from 2.1 s to 2.6 s on the simulated 4G).
// LEARN: LG-03R fonts-after-paint | A dynamic import of a stylesheet becomes a chunk that is requested only when this line runs, so the font faces are not something the first paint is measured against: the page paints in system fonts, the faces swap in, and the header is built so the swap moves nothing (largest contentful paint 2.6 s with the fonts declared up front, 2.3 s after the paint)
afterFirstPaint(() => {
  void import('./app/fonts.css')
})

afterFirstPaint(() => {
  import('./telemetry/tracing.ts')
    .then(({ startTracing }) => {
      startTracing()
    })
    .catch((error: unknown) => {
      // Telemetry must never break the app; report it and carry on.
      console.warn('Browser tracing could not be started', error)
    })
})
