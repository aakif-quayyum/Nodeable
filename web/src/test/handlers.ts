import { http, HttpResponse } from 'msw'
import type { components } from '../api/schema'

type CrawlStatus = components['schemas']['CrawlStatusResponse']

export const crawlStatusFixture: CrawlStatus = {
  queueDepth: 0,
  fetchRatePerMinute: null,
  cacheHitRatio: null,
}

// Default handlers: every test starts from these, and individual tests override them with server.use(...).
export const handlers = [http.get('/api/v1/status/crawl', () => HttpResponse.json(crawlStatusFixture))]
