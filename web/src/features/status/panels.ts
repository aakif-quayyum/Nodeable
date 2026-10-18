import { type MetricsResponse, type PanelData, seriesOf, shownPoints, type Unit } from './statusModel.ts'

/** A line the chart draws at a value, for a service level objective's limit. */
export interface Threshold {
  value: number
  label: string
}

export interface PanelSpec {
  id: string
  title: string
  unit: Unit
  /** The ids of the series drawn, in the order of their colours, dashes and markers. */
  seriesIds: string[]
  thresholds?: Threshold[]
  /** Only the private answer carries these series. */
  private?: boolean
}

// The panels of spec section 11 ("Time-series panels"). The limits drawn as lines are the targets of spec section 11,
// written once on the server in SloDefinitions and repeated here for the axis.
export const panelSpecs: PanelSpec[] = [
  { id: 'jobs', title: 'Jobs done and failed', unit: 'perMinute', seriesIds: ['jobs.done', 'jobs.failed'] },
  { id: 'mb', title: 'MusicBrainz requests', unit: 'perMinute', seriesIds: ['mb.requests.2xx', 'mb.requests.4xx', 'mb.requests.5xx', 'mb.requests.error'] },
  { id: 'mb503', title: 'MusicBrainz 503 rate', unit: 'ratio', seriesIds: ['mb.rate503'], thresholds: [{ value: 0.01, label: '1% limit' }] },
  { id: 'cache', title: 'Cache lookups', unit: 'perMinute', seriesIds: ['cache.hit', 'cache.miss', 'cache.stale'] },
  { id: 'api', title: 'Api requests', unit: 'perMinute', seriesIds: ['api.requests', 'api.errors'], private: true },
  {
    id: 'apiSpeed',
    title: 'Api requests answered fast',
    unit: 'ratio',
    seriesIds: ['api.under300ms', 'api.under1000ms'],
    thresholds: [{ value: 0.95, label: '95% target' }],
    private: true,
  },
  { id: 'queue', title: 'Jobs waiting', unit: 'jobs', seriesIds: ['queue.depth'] },
  {
    id: 'previews',
    title: 'Previews looked up',
    unit: 'perMinute',
    seriesIds: ['preview.found.isrc', 'preview.found.title_artist', 'preview.rejected', 'preview.none'],
    private: true,
  },
]

/** The data of each panel the response can fill. A series the Api did not send is left out, not drawn as zeros. */
export function buildPanels(response: MetricsResponse, isPrivate: boolean): { spec: PanelSpec; data: PanelData }[] {
  return panelSpecs
    .filter((spec) => isPrivate || !spec.private)
    .map((spec) => ({
      spec,
      data: {
        id: spec.id,
        title: spec.title,
        unit: spec.unit,
        series: spec.seriesIds
          .filter((id) => response.series.some((s) => s.id === id))
          .map((id) => {
            const series = seriesOf(response, id)
            return { id, label: series.label, points: shownPoints(series, response.stepSeconds, spec.unit) }
          }),
      },
    }))
    .filter((panel) => panel.data.series.length > 0)
}
