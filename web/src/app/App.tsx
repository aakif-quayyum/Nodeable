import { RouterProvider } from 'react-router/dom'
import { Providers } from './providers.tsx'
import { createAppRouter } from './router.tsx'

// Created once at module level: the router owns the browser history, so it must not be rebuilt on every render.
const router = createAppRouter()

export function App() {
  return (
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  )
}
