using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Nodeable.Domain.Entities;
using Nodeable.Infrastructure.Persistence;
using Nodeable.Infrastructure.Telemetry;

namespace Nodeable.Infrastructure.Metrics;

/// <summary>
/// The daily SLO check (NFR-OBS-04, decision 0023): works out each objective of spec section 11 from the last 30 days of
/// the rollup, stores one <c>slo_checks</c> row for each, and logs a breach at Warning. It judges the host it runs on, so it
/// cannot see that host being down; the external uptime monitor covers that.
/// </summary>
public sealed partial class SloChecker(NodeableDbContext db, TimeProvider time, ILogger<SloChecker> logger)
{
    private sealed class SumRow
    {
        public string Metric { get; set; } = string.Empty;
        public string Dimension { get; set; } = string.Empty;
        public long Count { get; set; }
    }

    // Upper bounds, in the unit of each histogram, that count as meeting the objective.
    private static readonly HashSet<string> _searchGood = ["100", "300", "1000"];
    private static readonly HashSet<string> _graphLoadGood = ["100", "300"];
    private static readonly HashSet<string> _freshnessGood = ["1", "10", "60", "600"];

    /// <summary>Checks every objective now and returns the rows it stored.</summary>
    public async Task<IReadOnlyList<SloCheck>> RunAsync(CancellationToken cancellationToken)
    {
        using var activity = InfrastructureTelemetry.ActivitySource.StartActivity("slo.check");
        var now = time.GetUtcNow();
        var from = now.AddDays(-SloDefinitions.WindowDays);

        // The 5-minute rows are the ones that cover 30 days (1-minute rows are kept for 7). They are folded within about an
        // hour of the minute, so the newest hour is not in the check; over 30 days that is under 0.2 percent of the window.
        var sums = await db.Database.SqlQuery<SumRow>(
            $"""
            SELECT metric AS metric, dimension AS dimension, SUM(count)::bigint AS count
            FROM metric_rollups
            WHERE resolution = '5m' AND bucket_start >= {from} AND bucket_start < {now}
              AND metric IN ('api.requests', 'api.latency', 'crawl.queue.wait', 'external.requests')
            GROUP BY metric, dimension
            """).ToListAsync(cancellationToken);

        var rows = sums.Select(s => (s.Metric, Labels: RollupMetrics.ParseDimension(s.Dimension), s.Count)).ToList();

        var observed = new Dictionary<string, double?>
        {
            [SloDefinitions.ApiAvailability] = Share(
                rows.Where(r => r.Metric == RollupMetrics.ApiRequests),
                r => r.Labels.GetValueOrDefault("class") != "5xx"),
            [SloDefinitions.SearchLatency] = Share(
                rows.Where(r => r.Metric == RollupMetrics.ApiLatency && r.Labels.GetValueOrDefault("route") == "search"),
                r => _searchGood.Contains(r.Labels.GetValueOrDefault("le") ?? string.Empty)),
            [SloDefinitions.GraphLoadLatency] = Share(
                rows.Where(r => r.Metric == RollupMetrics.ApiLatency && r.Labels.GetValueOrDefault("route") == "graph_load"),
                r => _graphLoadGood.Contains(r.Labels.GetValueOrDefault("le") ?? string.Empty)),
            [SloDefinitions.CrawlFreshness] = Share(
                rows.Where(r => r.Metric == RollupMetrics.CrawlQueueWait),
                r => _freshnessGood.Contains(r.Labels.GetValueOrDefault("le") ?? string.Empty)),
            [SloDefinitions.MusicBrainz503Rate] = Share(
                rows.Where(r => r.Metric == RollupMetrics.ExternalRequests && r.Labels.GetValueOrDefault("source") == "musicbrainz"),
                r => r.Labels.GetValueOrDefault("status") == "503"),
        };

        var stored = new List<SloCheck>();
        foreach (var slo in SloDefinitions.All)
        {
            var value = observed[slo.Id];
            var check = new SloCheck
            {
                CheckedAt = now,
                Slo = slo.Id,
                WindowDays = SloDefinitions.WindowDays,
                Observed = value,
                Target = slo.Target,
                Breached = slo.IsBreachedBy(value),
            };
            stored.Add(check);

            if (value is null)
            {
                LogUnmeasured(logger, slo.Id);
            }
            else if (check.Breached)
            {
                LogBreach(logger, slo.Id, value.Value, slo.Target);
            }
        }

        db.SloChecks.AddRange(stored);
        await db.SaveChangesAsync(cancellationToken);
        return stored;
    }

    /// <summary>
    /// The share of observations for which <paramref name="matches"/> is true, or null when there were none: no data is not
    /// a pass and not a failure, and the status page shows it as unmeasured.
    /// </summary>
    private static double? Share(IEnumerable<(string Metric, IReadOnlyDictionary<string, string> Labels, long Count)> rows, Func<(string Metric, IReadOnlyDictionary<string, string> Labels, long Count), bool> matches)
    {
        // LEARN: LG-04 slo-from-buckets | An SLO is a sum of counted buckets, not an estimate from a percentile: the histograms have a bound exactly at the SLO's limit (300 ms, 1 s, 10 minutes), so "share under the limit" is the counts at or below that bound divided by all the counts, and it is exact
        var list = rows.ToList();
        var total = list.Sum(r => r.Count);
        return total == 0 ? null : (double)list.Where(matches).Sum(r => r.Count) / total;
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "SLO breached: {Slo} observed {Observed:P2}, target {Target:P2}")]
    private static partial void LogBreach(ILogger logger, string slo, double observed, double target);

    [LoggerMessage(Level = LogLevel.Information, Message = "SLO {Slo} has no data in the window: unmeasured")]
    private static partial void LogUnmeasured(ILogger logger, string slo);
}
