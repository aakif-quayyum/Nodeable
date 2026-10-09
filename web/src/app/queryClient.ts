import { QueryClient } from '@tanstack/react-query'

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Data younger than this is served from the cache without a request.
        staleTime: 10_000,
        retry: 1,
      },
    },
  })
}
