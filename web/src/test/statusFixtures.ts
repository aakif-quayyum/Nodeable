import type { components } from '../api/schema'

type MetricsResponse = components['schemas']['MetricsResponse']
type MetricSeries = components['schemas']['MetricSeries']

/** Five one-minute steps ending at 12:05 UTC on 2026-10-12. */
export const fixtureTimes = ['12:01', '12:02', '12:03', '12:04', '12:05'].map((t) => `2026-10-12T${t}:00Z`)

export function series(id: string, label: string, points: (number | null)[], unit = 'count'): MetricSeries {
  return { id, label, unit, points }
}

/** A private metrics answer with a value for most series, one gap, a heatmap and the five objectives. */
export function privateMetrics(overrides: Partial<MetricsResponse> = {}): MetricsResponse {
  return {
    from: '2026-10-12T12:00:30Z',
    to: '2026-10-12T12:05:30Z',
    stepSeconds: 60,
    resolution: '1m',
    times: fixtureTimes,
    series: [
      series('queue.depth', 'Jobs waiting', [3, 4, 2, 1, 0], 'jobs'),
      series('queue.oldest_pending', 'Oldest job waiting', [20, 30, 10, 5, 0], 'seconds'),
      series('jobs.done', 'Jobs done', [6, 12, null, 9, 3]),
      series('jobs.failed', 'Jobs failed', [0, 1, null, 0, 0]),
      series('mb.requests.2xx', 'MusicBrainz 2xx', [5, 5, null, 4, 1]),
      series('mb.requests.4xx', 'MusicBrainz 4xx', [0, 0, null, 0, 0]),
      series('mb.requests.5xx', 'MusicBrainz 5xx', [0, 1, null, 0, 0]),
      series('mb.requests.error', 'MusicBrainz no answer', [0, 0, null, 0, 0]),
      series('mb.rate503', 'MusicBrainz 503 rate', [0, 0.1, null, 0, null], 'ratio'),
      series('cache.hit', 'Cache hits', [7, 6, null, 3, 2]),
      series('cache.miss', 'Cache misses', [1, 2, null, 1, 0]),
      series('cache.stale', 'Stale reads', [0, 0, null, 0, 0]),
      series('cache.hitRatio', 'Cache hit ratio', [0.875, 0.75, null, 0.75, 1], 'ratio'),
      series('api.requests', 'Api requests', [10, 12, 0, 8, 6]),
      series('api.errors', 'Api 5xx', [0, 0, 0, 1, 0]),
      series('api.errorRate', 'Api 5xx rate', [0, 0, null, 0.125, 0], 'ratio'),
      series('api.under300ms', 'Api requests under 300 ms', [1, 1, null, 0.9, 1], 'ratio'),
      series('api.under1000ms', 'Api requests under 1 s', [1, 1, null, 1, 1], 'ratio'),
      series('preview.found.isrc', 'Previews found by ISRC', [1, 0, null, 2, 0]),
      series('preview.found.title_artist', 'Previews found by title and artist', [0, 0, null, 0, 0]),
      series('preview.rejected', 'Previews refused by the guard', [0, 0, null, 0, 0]),
      series('preview.none', 'No preview at Deezer', [0, 1, null, 0, 0]),
    ],
    heatmap: { bounds: ['0.25', '0.5', '1', '2', '5', 'inf'], cells: [[0, 0, 4], [0, 2, 1], [1, 1, 3], [3, 5, 1]] },
    slos: [
      { slo: 'api-availability', label: 'API availability', target: 0.995, atLeast: true, observed: 0.999, breached: false, checkedAt: '2026-10-12T03:17:00Z' },
      { slo: 'search-latency', label: 'Search latency (under 1 s)', target: 0.95, atLeast: true, observed: null, breached: false, checkedAt: null },
      { slo: 'graph-load-latency', label: 'Cached graph load (under 300 ms)', target: 0.95, atLeast: true, observed: 0.9, breached: true, checkedAt: '2026-10-12T03:17:00Z' },
      { slo: 'crawl-freshness', label: 'Crawl freshness (claimed within 10 minutes)', target: 0.99, atLeast: true, observed: 0.995, breached: false, checkedAt: '2026-10-12T03:17:00Z' },
      { slo: 'musicbrainz-503-rate', label: 'MusicBrainz 503 rate', target: 0.01, atLeast: false, observed: 0.02, breached: true, checkedAt: '2026-10-12T03:17:00Z' },
    ],
    breaches: [{ at: '2026-10-12T12:03:00Z', slo: 'graph-load-latency', observed: 0.9, target: 0.95, text: 'Cached graph load (under 300 ms) 90%, target 95%' }],
    ...overrides,
  }
}
