# 0023. Monitoring is built in: a metrics rollup in PostgreSQL, a status page with Apache ECharts, and no Grafana

- **Status:** Accepted for the choices the developer made on 2026-10-14 (no Grafana, the rollup and its retention, ECharts, the status page's panels, the Aspire Dashboard for traces, an external uptime monitor and a daily SLO check). The three items under "Proposed, to confirm" are the assistant's and are not settled until the developer says so. Nothing is built.
- **Date:** 2026-10-14
- **Spec:** section 5 (NFR-OBS-01 to 04, NFR-COST-01), section 6, section 9 (status endpoints), section 11, section 12 (status charts), section 13 (deployment), FR-ABOUT-01; supersedes the Grafana Cloud plan in sections 6, 7 and 11 and the "Grafana dashboards and SLO alerts" task of M4

## Context

The spec planned an OpenTelemetry Collector forwarding to Grafana Cloud (Tempo, Prometheus, Loki), three Grafana dashboards and Grafana alert rules. The developer set the hosting budget to USD 0 (decision 0024) and chose not to depend on Grafana at all. Three things still have to exist at launch: a way to see traces, a way to see how the crawler and the Api are doing, and a way to be told when something is wrong. The About page also promises "a live crawl status panel from real telemetry" (FR-ABOUT-01).

## Decision

1. **OpenTelemetry stays in the code as it is.** Traces, metrics and logs still leave every process through OTLP (NFR-OBS-01). Only the destination changes.
2. **Traces are read in the standalone Aspire Dashboard container** on the production host, behind Caddy basic authentication, on a hostname of its own (a web app is simplest on its own hostname; whether the dashboard works under a path prefix was not checked). It receives OTLP itself, so **the OpenTelemetry Collector is dropped**. The browser's `/otlp` route (decision 0004) is proxied by Caddy to its OTLP/HTTP port. The dashboard keeps what it receives in memory, so traces do not survive a restart and are limited in number: it is a viewer, not storage.
3. **Numbers that must outlive a restart go in a rollup table in PostgreSQL.** One row per metric, dimension and time bucket, updated every minute: jobs done and failed, MusicBrainz requests, 503s and latency buckets, cache hits, misses and stale reads, queue depth, and the Api's requests and latency. **1-minute rows are kept for 7 days and 5-minute rows for 90 days** (section 8).
4. **A password-protected `/status` page** reads the rollup and mimics a Grafana dashboard: a time-range picker (1 h, 6 h, 24 h, 7 d), auto-refresh (MUI controls), stat tiles with sparklines, time-series panels with a synced crosshair and drag-to-zoom, SLO threshold lines, a gauge for queue depth and a heatmap of MusicBrainz request latency. The Api returns data **already bucketed to the chart's width**, so the browser never receives more points than it can draw.
5. **The About page's crawl panel uses the same chart components**, read-only, from a public endpoint that exposes the crawler's aggregates and nothing else.
6. **Alerting is external and small.** A free uptime monitor calls a health endpoint from outside the host, and a **daily SLO check job** computes the SLOs of section 11 from the rollup, logs each breach and stores it so `/status` shows it as an annotation. There are no alert rules to run.
7. **Charts are drawn with Apache ECharts** (`echarts` with a thin React wrapper of our own, tree-shaken, in a lazy chunk used by `/status` and `/about` only, so first-load JavaScript is unchanged), themed from the design tokens for both colour schemes.

## Why ECharts

The panels above are a fixed list, so the question is which library draws all of them without drawing some by hand.

| Need | Apache ECharts | MUI X Charts | Recharts | uPlot |
| --- | --- | --- | --- | --- |
| Time-series lines and bars | Built in | Built in (Community, MIT) | Built in | Built in, very fast |
| Heatmap | Built in (`HeatmapChart`) | **Pro plan component** (the heatmap page carries a Pro badge; checked 2026-10-14) | Not a chart type; would be hand-drawn | Not offered; needs a custom plugin |
| Gauge | Built in (`GaugeChart`) | A gauge exists; its licence tier was not stated on the page checked | Built by hand from a pie or radial bar | Not offered |
| Threshold lines, annotations | `markLine`, `markArea` | Reference lines | `ReferenceLine`, `ReferenceArea` | Hooks and plugins |
| Synced crosshair across panels | `echarts.connect` on a group | Possible; not checked | `syncId` | Cursor sync built in |
| Drag to zoom | `dataZoom` / brush | Zoom is a documented feature; its tier was not stated on the page checked | A `Brush` component | Built in |
| Size | Tree-shakeable: import only the chart types and components used (an indicative figure for a line chart is about 200 KB minified; **measured in the pull request that adds it**) | Small | Medium | About 45 to 50 KB minified |
| Licence | Apache-2.0 | MIT for Community; Pro and Premium are commercial | MIT | MIT |
| Fit | Imperative API, needs a wrapper; themed by option objects | Fits MUI's theme | Declarative React | Imperative, minimal styling |

- **Recharts and uPlot** each lose on the same two panels (the heatmap and the gauge), which would be drawn with D3 by hand, and the spec's requirement is that the page "mimics a Grafana dashboard".
- **MUI X Charts** fits the theme best, but its heatmap is a commercial component, and a free-forever stack should not depend on one licence boundary for a panel the page promises.
- **ECharts** is the only one of the four with every panel built in. Its costs are size, which the tree-shaking and the lazy chunk contain, and a wrapper of about forty lines.
- What was **not** checked: Recharts' current chart list and MUI X Charts' tier for the gauge and for zoom were not read from their documentation on 2026-10-14; the table says so where it matters. Neither changes the result, because the heatmap alone decides it.

## Consequences

- **Learning goals change.** The Grafana items (TraceQL, PromQL, dashboards, alerts) are replaced by: the Meter API and `MeterListener`, time bucketing in SQL (`date_bin`), rollups and retention, and ECharts' option model. The spec's section 6 says so.
- **A rollup is a sample, not the OpenTelemetry stream.** It records what the app's own meters saw, once a minute; a process that dies loses up to a minute of its deltas. That is acceptable for a portfolio status page and is stated on it.
- **A gap is not zero.** A minute with no row is returned as `null`, and the charts leave a gap (principle 5).
- **The chart libraries' canvas is not accessible by itself.** Each panel has a text alternative (ECharts' `aria` option) and a "View as table" toggle with the same numbers, and series differ by more than colour (NFR-A11Y-01, NFR-A11Y-02). Reduced motion turns chart animation off (NFR-MOTION-01).
- **The page is one more thing to secure.** It is behind a password, answers only aggregates (no graph tokens, no email addresses, no IP addresses), and its failures are rate limited.
- **The external monitor sees only that the site answers.** It cannot see what the SLO check sees, and the SLO check runs on the host it judges, so it cannot see the host down. The two are complementary, and neither is a pager: breaches are logged and emailed by the monitor, and read on the page.
- **Traces are not durable** (item 2). If a trace has to be kept, it is exported by hand from the dashboard. Moving to durable trace storage is a later decision and would not change the code.
- The first-load budget of 250 KB is untouched; the chart chunk is reported separately like the other lazy chunks (decision 0002) and given its own budget when it is measured.

## Proposed, to confirm

These are the assistant's proposals and have not been approved.

1. **How `/status` is protected.** The Api enforces HTTP Basic authentication on the private status endpoints (`/api/v1/status/private/...`), with the password taken from the host's secret store and compared in constant time, and failed attempts rate limited. The page `/status` is a static route that holds no data. Reason: the check is then code, so a test can prove an unauthenticated request gets 401, and it works the same locally. Caddy's basic auth is used for the Aspire Dashboard hostname. The alternative is Caddy basic auth for both, which is less code and untested by the suite. Browsers send cached Basic credentials to the paths below the one that asked for them; that behaviour is to be confirmed in a browser when the page is built.
2. **Who writes the rollup.** Each process (Api and Worker) listens to its own meters with `System.Diagnostics.Metrics.MeterListener`, aggregates in memory and, once a minute, adds its deltas to the table with `INSERT ... ON CONFLICT DO UPDATE SET count = count + excluded.count`, so any number of instances can write. The Worker, as the developer specified, also does what only one process should: it samples the queue depth, rolls 1-minute rows into 5-minute rows, deletes rows past their retention, and runs the daily SLO check (Hangfire recurring jobs, decision to come with the refresh). The Api writes its own request figures because the Worker cannot see another process's memory. The alternative that keeps the Worker the only writer needs the Api to stage its counts somewhere shared (Redis), which adds a write per request or a second flusher anyway.
3. **Which uptime monitor.** **Better Stack's free plan**: 10 monitors checked every 3 minutes, and reviews describe commercial use as allowed. The alternative is **UptimeRobot's free plan**: 50 monitors every 5 minutes, but its terms on commercial use are described differently by different sources and its own terms page could not be read on 2026-10-14. Both figures come from third-party summaries and must be read from the provider's pages at signup. Either monitors one URL, `GET /api/v1/status/health`, and needs only an email address. It is configured by hand, not in Terraform.

## Alternatives considered

| Option | Why it lost |
| --- | --- |
| Grafana Cloud free tier with the Collector (the original plan) | The developer chose to depend on no Grafana service, and the free tier's limits and terms would be one more thing to track |
| Self-hosted Grafana, Prometheus and Tempo on the host | Three or four more containers to run and secure on a free host, for the same pictures |
| Read everything from the Aspire Dashboard | It holds traces, logs and metrics in memory only, has no retention, no SLO view and no public slice for the About page |
| A SaaS status page (Better Stack, UptimeRobot) as the status page | Not ours, shows availability only, and teaches nothing about instrumentation |
| Prometheus-style metrics endpoint scraped by nothing | There is no scraper to keep; the rollup is the scraper |
