import { http, HttpResponse } from 'msw'
import type { components } from '../api/schema'

type CrawlStatus = components['schemas']['CrawlStatusResponse']

export const crawlStatusFixture: CrawlStatus = {
  queueDepth: 0,
  fetchRatePerMinute: null,
  cacheHitRatio: null,
}

// Default handlers: every test starts from these, and individual tests override them with server.use(...).
// Search is not part of the default state of any page: a test that searches says what comes back.
export const handlers = [
  http.get('/api/v1/status/crawl', () => HttpResponse.json(crawlStatusFixture)),
  // A graph with hubs asks for recommendations; most tests are not about them, so the default is none.
  http.get('/api/v1/graphs/:id/recommendations', () => HttpResponse.json({ items: [] })),
  http.get('/api/v1/search/recordings', () => HttpResponse.json({ source: 'musicBrainz', results: [] })),
]
