import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { components } from '../../api/schema'
import { crawlStatusFixture } from '../../test/handlers.ts'
import { renderAt } from '../../test/renderApp.tsx'
import { server } from '../../test/server.ts'

type CrawlStatus = components['schemas']['CrawlStatusResponse']

function respondWith(status: CrawlStatus) {
  server.use(http.get('/api/v1/status/crawl', () => HttpResponse.json(status)))
}

describe('About page crawl status', () => {
  it('FR_ABOUT_01 shows how many jobs are waiting in the crawl queue', async () => {
    respondWith({ ...crawlStatusFixture, queueDepth: 7 })
    renderAt('/about')

    expect(await screen.findByText('7 jobs waiting')).toBeInTheDocument()
  })

  it('FR_ABOUT_01 uses the singular for one waiting job', async () => {
    respondWith({ ...crawlStatusFixture, queueDepth: 1 })
    renderAt('/about')

    expect(await screen.findByText('1 job waiting')).toBeInTheDocument()
  })

  // Spec principle 5: a figure nobody has measured must not be drawn as 0.
  it('FR_ABOUT_01 shows unmeasured figures as "Not measured yet", never as zero', async () => {
    renderAt('/about')

    expect(await screen.findByText('0 jobs waiting')).toBeInTheDocument()
    expect(screen.getAllByText('Not measured yet')).toHaveLength(2)
  })

  it('FR_ABOUT_01 formats the fetch rate and cache hit ratio when the Worker has measured them', async () => {
    respondWith({ queueDepth: 3, fetchRatePerMinute: 12.34, cacheHitRatio: 0.875 })
    renderAt('/about')

    expect(await screen.findByText('12.3 per minute')).toBeInTheDocument()
    expect(screen.getByText('88%')).toBeInTheDocument()
  })

  it('FR_ABOUT_01 explains when the crawl status cannot be loaded', async () => {
    server.use(http.get('/api/v1/status/crawl', () => new HttpResponse(null, { status: 500 })))
    renderAt('/about')

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load crawl status')
  })
})
