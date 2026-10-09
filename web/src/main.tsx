import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App.tsx'

// LEARN: LG-01 ts-non-null | The "!" after getElementById tells TypeScript "I know this is not null": it removes the type's `| null` without any runtime check, so use it only where the page guarantees the element exists (index.html has #root)
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
