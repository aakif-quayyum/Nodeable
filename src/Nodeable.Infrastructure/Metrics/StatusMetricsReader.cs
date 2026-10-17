using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Nodeable.Infrastructure.Persistence;
using Nodeable.Infrastructure.Telemetry;

namespace Nodeable.Infrastructure.Metrics;

/// <summary>Which answer is wanted: the public one carries only the crawler's numbers.</summary>
public enum MetricsScope
{
    Public,
    Private,
}

/// <summary>
/// Reads the rollup for the status page and the About page (NFR-OBS-03, decision 0023): the window cut into steps no
/// narrower than the chart can draw, every series aligned to the same times, and a gap reported as <c>null</c>.
/// </summary>
public sealed class StatusMetricsReader(NodeableDbContext db, TimeProvider time)
{
    public const int MinWidth = 10;
    public const int MaxWidth = 600;
    public const int DefaultWidth = 120;

    /// <summary>The longest window one request may ask for: the 5-minute rows are kept for 90 days.</summary>
    public static readonly TimeSpan MaxSpan = RollupMaintenance.FiveMinuteRetention;

    private sealed class BinRow
    {
        public DateTimeOffset Bin { get; set; }
        public string Metric { get; set; } = string.Empty;
        public string Dimension { get; set; } = string.Empty;
        public long Count { get; set; }
        public double? Last { get; set; }
    }

    private sealed class Slot(int bins)
    {
        public long[] Count { get; } = new long[bins];
        public double?[] Last { get; } = new double?[bins];
        public bool[] Has { get; } = new bool[bins];
    }

    private static readonly string[] _publicMetrics =
    [
        RollupMetrics.ProcessUp, RollupMetrics.QueueDepth, RollupMetrics.QueueOldestPending, RollupMetrics.CrawlJobs,
        RollupMetrics.ExternalRequests, RollupMetrics.CacheLookups,
    ];

    private static readonly string[] _privateMetrics =
    [
        .. _publicMetrics, RollupMetrics.ApiRequests, RollupMetrics.ApiLatency, RollupMetrics.ExternalLatency, RollupMetrics.PreviewLookups,
    ];

    /// <summary>The series for <paramref name="from"/> to <paramref name="to"/>, at most <paramref name="width"/> steps wide.</summary>
    public async Task<MetricsResponse> GetAsync(DateTimeOffset from, DateTimeOffset to, int width, MetricsScope scope, CancellationToken cancellationToken)
    {
        using var activity = InfrastructureTelemetry.ActivitySource.StartActivity("status.metrics");
        var now = time.GetUtcNow();

        // 1-minute rows reach back 7 days; a window that starts earlier is read from the 5-minute rows.
        var (resolution, resolutionMinutes) = from >= now - RollupMaintenance.OneMinuteRetention ? ("1m", 1) : ("5m", 5);

        // Bins start on the resolution's own grid, so a 5-minute row never straddles two bins.
        var epochMinutes = (long)Math.Floor((from - DateTimeOffset.UnixEpoch).TotalMinutes);
        var origin = DateTimeOffset.UnixEpoch.AddMinutes(epochMinutes - (epochMinutes % resolutionMinutes));

        // The step is the smallest multiple of the resolution that gives no more than `width` points, counted from the
        // grid-aligned start, so aligning the start cannot add a bin beyond the width.
        var spanMinutes = (to - origin).TotalMinutes;
        var stepMinutes = Math.Max(resolutionMinutes, (int)Math.Ceiling(Math.Ceiling(spanMinutes / width) / resolutionMinutes) * resolutionMinutes);
        var bins = Math.Max(1, (int)Math.Ceiling((to - origin).TotalMinutes / stepMinutes));
        var times = Enumerable.Range(0, bins).Select(i => origin.AddMinutes((long)i * stepMinutes)).ToList();

        var metrics = scope == MetricsScope.Private ? _privateMetrics : _publicMetrics;

        // LEARN: LG-04 bucketed-series | date_bin(step, time, origin) cuts the window into equal bins in the database and the same query sums each label set per bin, so the browser gets at most `width` points per series however long the window; the bins are then laid out in an array with a slot for every time, which is what lets a missing bin be null instead of vanishing
        var rows = await db.Database.SqlQuery<BinRow>(
            $"""
            SELECT date_bin(({stepMinutes} * interval '1 minute'), bucket_start, {origin}) AS bin, metric AS metric, dimension AS dimension,
                   SUM(count)::bigint AS count,
                   (ARRAY_AGG("last" ORDER BY bucket_start DESC) FILTER (WHERE "last" IS NOT NULL))[1] AS "last"
            FROM metric_rollups
            WHERE resolution = {resolution} AND bucket_start >= {origin} AND bucket_start < {to} AND metric = ANY({metrics})
            GROUP BY 1, 2, 3
            """).ToListAsync(cancellationToken);

        var slots = new Dictionary<(string Metric, string Dimension), Slot>();
        foreach (var row in rows)
        {
            var index = (int)((row.Bin - origin).TotalMinutes / stepMinutes);
            if (index < 0 || index >= bins)
            {
                continue;
            }

            if (!slots.TryGetValue((row.Metric, row.Dimension), out var slot))
            {
                slots[(row.Metric, row.Dimension)] = slot = new Slot(bins);
            }

            slot.Count[index] += row.Count;
            slot.Last[index] = row.Last;
            slot.Has[index] = true;
        }

        var parsed = slots.Keys.ToDictionary(key => key, key => RollupMetrics.ParseDimension(key.Dimension));

        // Which bins each process was running in. An Api with no requests has a heartbeat (zero); no heartbeat is a gap (null).
        var apiUp = Alive(slots, "api", bins);
        var workerUp = Alive(slots, "worker", bins);
        var anyUp = Enumerable.Range(0, bins).Select(i => apiUp[i] || workerUp[i]).ToArray();

        long[] Total(string metric, Func<IReadOnlyDictionary<string, string>, bool> where)
        {
            var sum = new long[bins];
            foreach (var (key, slot) in slots.Where(pair => pair.Key.Metric == metric && where(parsed[pair.Key])))
            {
                for (var i = 0; i < bins; i++)
                {
                    sum[i] += slot.Count[i];
                }
            }

            return sum;
        }

        MetricSeries Counter(string id, string label, bool[] up, long[] counts) =>
            new(id, label, "count", Enumerable.Range(0, bins).Select(i => up[i] ? (double?)counts[i] : null).ToList());

        MetricSeries Ratio(string id, string label, bool[] up, long[] part, long[] whole) =>
            new(id, label, "ratio", Enumerable.Range(0, bins).Select(i => up[i] && whole[i] > 0 ? (double?)part[i] / whole[i] : null).ToList());

        MetricSeries Gauge(string id, string label, string unit, string metric, string dimension) =>
            new(id, label, unit, Enumerable.Range(0, bins).Select(i => slots.TryGetValue((metric, dimension), out var slot) && slot.Has[i] ? slot.Last[i] : null).ToList());

        static Func<IReadOnlyDictionary<string, string>, bool> Is(string key, string value) => labels => labels.GetValueOrDefault(key) == value;

        var mbRequests = Total(RollupMetrics.ExternalRequests, Is("source", "musicbrainz"));
        var mb503 = Total(RollupMetrics.ExternalRequests, labels => labels.GetValueOrDefault("source") == "musicbrainz" && labels.GetValueOrDefault("status") == "503");
        long[] MbClass(string klass) => Total(RollupMetrics.ExternalRequests, labels =>
            labels.GetValueOrDefault("source") == "musicbrainz" && (labels.GetValueOrDefault("status") ?? string.Empty).StartsWith(klass, StringComparison.Ordinal));
        var hits = Total(RollupMetrics.CacheLookups, Is("result", "hit"));
        var misses = Total(RollupMetrics.CacheLookups, Is("result", "miss"));
        var hitDenominator = Enumerable.Range(0, bins).Select(i => hits[i] + misses[i]).ToArray();

        var series = new List<MetricSeries>
        {
            Gauge("queue.depth", "Jobs waiting", "jobs", RollupMetrics.QueueDepth, RollupMetrics.Dimension(("status", "pending"))),
            Gauge("queue.oldest_pending", "Oldest job waiting", "seconds", RollupMetrics.QueueOldestPending, string.Empty),
            Counter("jobs.done", "Jobs done", workerUp, Total(RollupMetrics.CrawlJobs, Is("outcome", "done"))),
            Counter("jobs.failed", "Jobs failed", workerUp, Total(RollupMetrics.CrawlJobs, Is("outcome", "failed"))),
            Counter("mb.requests.2xx", "MusicBrainz 2xx", anyUp, MbClass("2")),
            Counter("mb.requests.4xx", "MusicBrainz 4xx", anyUp, MbClass("4")),
            Counter("mb.requests.5xx", "MusicBrainz 5xx", anyUp, MbClass("5")),
            Counter("mb.requests.error", "MusicBrainz no answer", anyUp, Total(RollupMetrics.ExternalRequests, labels =>
                labels.GetValueOrDefault("source") == "musicbrainz" && labels.GetValueOrDefault("status") == "error")),
            Ratio("mb.rate503", "MusicBrainz 503 rate", anyUp, mb503, mbRequests),
            Counter("cache.hit", "Cache hits", anyUp, hits),
            Counter("cache.miss", "Cache misses", anyUp, misses),
            Counter("cache.stale", "Stale reads", anyUp, Total(RollupMetrics.CacheLookups, Is("result", "stale"))),
            Ratio("cache.hitRatio", "Cache hit ratio", anyUp, hits, hitDenominator),
        };

        MetricHeatmap? heatmap = null;
        IReadOnlyList<SloStatus>? slos = null;
        IReadOnlyList<SloBreach>? breaches = null;

        if (scope == MetricsScope.Private)
        {
            var apiRequests = Total(RollupMetrics.ApiRequests, _ => true);
            var apiErrors = Total(RollupMetrics.ApiRequests, Is("class", "5xx"));
            long[] UnderMs(params string[] bounds) => Total(RollupMetrics.ApiLatency, labels =>
                labels.GetValueOrDefault("route") == "all" && bounds.Contains(labels.GetValueOrDefault("le")));
            var allLatency = Total(RollupMetrics.ApiLatency, Is("route", "all"));

            series.AddRange(
            [
                Counter("api.requests", "Api requests", apiUp, apiRequests),
                Counter("api.errors", "Api 5xx", apiUp, apiErrors),
                Ratio("api.errorRate", "Api 5xx rate", apiUp, apiErrors, apiRequests),
                Ratio("api.under300ms", "Api requests under 300 ms", apiUp, UnderMs("100", "300"), allLatency),
                Ratio("api.under1000ms", "Api requests under 1 s", apiUp, UnderMs("100", "300", "1000"), allLatency),
                Counter("preview.found.isrc", "Previews found by ISRC", workerUp, Total(RollupMetrics.PreviewLookups, labels => labels.GetValueOrDefault("result") == "found" && labels.GetValueOrDefault("method") == "isrc")),
                Counter("preview.found.title_artist", "Previews found by title and artist", workerUp, Total(RollupMetrics.PreviewLookups, labels => labels.GetValueOrDefault("result") == "found" && labels.GetValueOrDefault("method") == "title_artist")),
                Counter("preview.rejected", "Previews refused by the guard", workerUp, Total(RollupMetrics.PreviewLookups, Is("result", "rejected"))),
                Counter("preview.none", "No preview at Deezer", workerUp, Total(RollupMetrics.PreviewLookups, Is("result", "none"))),
            ]);

            heatmap = BuildHeatmap(slots, parsed, bins);
            (slos, breaches) = await ReadSlosAsync(from, to, cancellationToken);
        }

        return new MetricsResponse(from, to, stepMinutes * 60, resolution, times, series, heatmap, slos, breaches);
    }

    private sealed class FigureRow
    {
        public long Requests { get; set; }
        public long Hits { get; set; }
        public long Misses { get; set; }
        public long Beats { get; set; }
    }

    /// <summary>
    /// The two figures of <c>GET /status/crawl</c> that need the rollup: external fetches a minute over the last 10 minutes, and
    /// the cache hit ratio over the last 24 hours. Each is null while unmeasured (no process wrote a heartbeat, or no lookup was
    /// made), never a made-up 0.
    /// </summary>
    public async Task<(double? FetchRatePerMinute, double? CacheHitRatio)> GetCrawlFiguresAsync(CancellationToken cancellationToken)
    {
        var now = time.GetUtcNow();
        var recent = now.AddMinutes(-10);
        var day = now.AddHours(-24);

        var figures = await db.Database.SqlQuery<FigureRow>(
            $"""
            SELECT COALESCE(SUM(count) FILTER (WHERE metric = 'external.requests' AND bucket_start >= {recent}), 0)::bigint AS requests,
                   COALESCE(SUM(count) FILTER (WHERE metric = 'cache.lookups' AND dimension LIKE '%result=hit%'), 0)::bigint AS hits,
                   COALESCE(SUM(count) FILTER (WHERE metric = 'cache.lookups' AND dimension LIKE '%result=miss%'), 0)::bigint AS misses,
                   COALESCE(SUM(count) FILTER (WHERE metric = 'process.up' AND bucket_start >= {recent}), 0)::bigint AS beats
            FROM metric_rollups
            WHERE resolution = '1m' AND bucket_start >= {day} AND bucket_start < {now}
              AND metric IN ('external.requests', 'cache.lookups', 'process.up')
            """).SingleAsync(cancellationToken);

        double? rate = figures.Beats > 0 ? figures.Requests / 10.0 : null;
        double? ratio = figures.Hits + figures.Misses > 0 ? (double)figures.Hits / (figures.Hits + figures.Misses) : null;
        return (rate, ratio);
    }

    private static bool[] Alive(Dictionary<(string Metric, string Dimension), Slot> slots, string process, int bins) =>
        slots.TryGetValue((RollupMetrics.ProcessUp, RollupMetrics.Dimension(("process", process))), out var slot) ? slot.Has : new bool[bins];

    private static MetricHeatmap BuildHeatmap(
        Dictionary<(string Metric, string Dimension), Slot> slots,
        Dictionary<(string Metric, string Dimension), IReadOnlyDictionary<string, string>> parsed,
        int bins)
    {
        var bounds = RollupMetrics.ExternalLatencyBounds.Select(b => b.ToString(CultureInfo.InvariantCulture)).Append("inf").ToList();
        var cells = new List<int[]>();
        foreach (var (key, slot) in slots.Where(pair => pair.Key.Metric == RollupMetrics.ExternalLatency && parsed[pair.Key].GetValueOrDefault("source") == "musicbrainz"))
        {
            var boundIndex = bounds.IndexOf(parsed[key].GetValueOrDefault("le") ?? string.Empty);
            if (boundIndex < 0)
            {
                continue;
            }

            for (var i = 0; i < bins; i++)
            {
                if (slot.Count[i] > 0)
                {
                    cells.Add([i, boundIndex, (int)Math.Min(slot.Count[i], int.MaxValue)]);
                }
            }
        }

        return new MetricHeatmap(bounds, cells);
    }

    private async Task<(IReadOnlyList<SloStatus>, IReadOnlyList<SloBreach>)> ReadSlosAsync(DateTimeOffset from, DateTimeOffset to, CancellationToken cancellationToken)
    {
        var recent = await db.SloChecks.AsNoTracking().OrderByDescending(c => c.CheckedAt).Take(200).ToListAsync(cancellationToken);
        var statuses = SloDefinitions.All.Select(definition =>
        {
            var latest = recent.FirstOrDefault(c => c.Slo == definition.Id);
            return new SloStatus(definition.Id, definition.Label, definition.Target, definition.AtLeast, latest?.Observed, latest?.Breached ?? false, latest?.CheckedAt);
        }).ToList();

        var breached = await db.SloChecks.AsNoTracking()
            .Where(c => c.Breached && c.CheckedAt >= from && c.CheckedAt < to)
            .OrderBy(c => c.CheckedAt)
            .ToListAsync(cancellationToken);
        var breaches = breached.Select(c =>
        {
            var definition = SloDefinitions.All.FirstOrDefault(d => d.Id == c.Slo);
            var label = definition?.Label ?? c.Slo;
            var observed = c.Observed is { } value ? (value * 100).ToString("0.#", CultureInfo.InvariantCulture) + "%" : "no data";
            var target = (c.Target * 100).ToString("0.#", CultureInfo.InvariantCulture) + "%";
            return new SloBreach(c.CheckedAt, c.Slo, c.Observed, c.Target, $"{label} {observed}, {(definition?.AtLeast ?? true ? "target" : "limit")} {target}");
        }).ToList();

        return (statuses, breaches);
    }
}
