import { http, HttpResponse } from 'msw'
import type { components } from '../api/schema'

type CrawlStatus = components['schemas']['CrawlStatusResponse']

// LEARN: LG-01 typed-fixture | The fixture is typed with the generated contract, so if the Api's response changes shape, regenerating the types makes this file (and every test built on it) fail to compile instead of quietly testing a stale shape
export const crawlStatusFixture: CrawlStatus = {
  queueDepth: 0,
  fetchRatePerMinute: null,
  cacheHitRatio: null,
}

// Default handlers: every test starts from these, and individual tests override them with server.use(...).
export const handlers = [http.get('/api/v1/status/crawl', () => HttpResponse.json(crawlStatusFixture))]
