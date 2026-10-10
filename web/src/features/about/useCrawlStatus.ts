import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../../api/client.ts'

export function useCrawlStatus() {
  return useQuery({
    // The key identifies this data in the cache; later, SignalR events will write to the same key (spec section 12).
    queryKey: ['status', 'crawl'],
    queryFn: async ({ signal }) => {
      const { data, response } = await apiClient.GET('/api/v1/status/crawl', { signal })

      // openapi-fetch does not throw on HTTP errors; it returns them. TanStack Query needs a thrown error to enter its error state.
      if (data === undefined) {
        throw new Error(`Crawl status request failed with HTTP ${response.status}`)
      }

      // `data` is typed from the OpenAPI contract: queueDepth is a number, the other two are number | null.
      return data
    },
  })
}
