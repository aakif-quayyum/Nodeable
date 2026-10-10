import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App.tsx'
import { afterFirstPaint } from './telemetry/afterFirstPaint.ts'

// LEARN: LG-01 ts-non-null | The "!" after getElementById tells TypeScript "I know this is not null": it removes the type's `| null` without any runtime check, so use it only where the page guarantees the element exists (index.html has #root)
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// LEARN: LG-01 deferred-import | A dynamic import() becomes its own JavaScript chunk that is downloaded only when this line runs, so the OpenTelemetry SDK is kept out of the main bundle and loaded after first paint (ADR 0002); requests made before it arrives are not traced
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
