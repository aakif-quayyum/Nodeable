import { latestComplete, type MetricsResponse, seriesOf, shownPoints, type Unit } from './statusModel.ts'

export interface Tile {
  id: string
  label: string
  unit: Unit
  value: number | null
  /** The points of the sparkline: what the tile shows, over the window. */
  points: (number | null)[]
}

interface TileSpec {
  id: string
  label: string
  unit: Unit
  /** The series added together for the tile. */
  seriesIds: string[]
  /** True for a sampled value (a gauge), whose newest point is as good as any; a count skips the step still filling. */
  sampled?: boolean
  private?: boolean
}

// The stat tiles of spec section 11. The Api's 95th-percentile latency tile of the first draft is the share under 300 ms:
// the Api returns the shares the objectives are about, not a percentile, so this is what it can say exactly.
const specs: TileSpec[] = [
  { id: 'queue', label: 'Jobs waiting', unit: 'jobs', seriesIds: ['queue.depth'], sampled: true },
  { id: 'oldest', label: 'Oldest job waiting', unit: 'seconds', seriesIds: ['queue.oldest_pending'], sampled: true },
  { id: 'done', label: 'Jobs done', unit: 'perMinute', seriesIds: ['jobs.done'] },
  { id: 'failed', label: 'Jobs failed', unit: 'perMinute', seriesIds: ['jobs.failed'] },
  { id: 'mb', label: 'MusicBrainz requests', unit: 'perMinute', seriesIds: ['mb.requests.2xx', 'mb.requests.4xx', 'mb.requests.5xx', 'mb.requests.error'] },
  { id: 'mb503', label: 'MusicBrainz 503 rate', unit: 'ratio', seriesIds: ['mb.rate503'] },
  { id: 'hit', label: 'Cache hit ratio', unit: 'ratio', seriesIds: ['cache.hitRatio'] },
  { id: 'api', label: 'Api requests', unit: 'perMinute', seriesIds: ['api.requests'], private: true },
  { id: 'errors', label: 'Api 5xx', unit: 'perMinute', seriesIds: ['api.errors'], private: true },
  { id: 'fast', label: 'Api answered under 300 ms', unit: 'ratio', seriesIds: ['api.under300ms'], private: true },
]

/** The tiles the response can fill. A tile whose every step is unmeasured shows "not measured". */
export function buildTiles(response: MetricsResponse, isPrivate: boolean): Tile[] {
  return specs
    .filter((spec) => isPrivate || !spec.private)
    .map((spec) => {
      const parts = spec.seriesIds.map((id) => shownPoints(seriesOf(response, id), response.stepSeconds, spec.unit))
      // Several series are added step by step; a step is unmeasured only when every part of it is.
      const points = response.times.map((_, i) => {
        const here = parts.map((p) => p[i] ?? null)
        return here.every((v) => v === null) ? null : here.reduce<number>((sum, v) => sum + (v ?? 0), 0)
      })
      const value = spec.sampled ? lastNonNull(points) : latestComplete(points)
      return { id: spec.id, label: spec.label, unit: spec.unit, value, points }
    })
}

function lastNonNull(points: readonly (number | null)[]): number | null {
  for (let i = points.length - 1; i >= 0; i--) {
    const value = points[i]
    if (value !== null && value !== undefined) return value
  }
  return null
}
