import { render } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { Providers } from '../app/providers.tsx'
import { createQueryClient } from '../app/queryClient.ts'
import { routes } from '../app/router.tsx'

// Renders the real routes in a memory router, so each test picks its starting URL.
// Each call gets a fresh QueryClient that never retries, so a failing request shows its error state immediately.
export function renderAt(path: string) {
  const queryClient = createQueryClient()
  queryClient.setDefaultOptions({ queries: { retry: false } })

  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return render(
    <Providers queryClient={queryClient}>
      <RouterProvider router={router} />
    </Providers>,
  )
}
