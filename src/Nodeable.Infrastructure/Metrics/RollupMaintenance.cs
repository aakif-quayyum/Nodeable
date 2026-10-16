using Microsoft.EntityFrameworkCore;
using Nodeable.Infrastructure.Persistence;
using Nodeable.Infrastructure.Telemetry;

namespace Nodeable.Infrastructure.Metrics;

/// <summary>
/// What only one process should do for the rollup, every minute, in the Worker (decision 0023): sample the queue, fold
/// 1-minute rows into 5-minute rows, and delete what has expired. It writes to PostgreSQL only and asks no one else.
/// </summary>
public sealed class RollupMaintenance(NodeableDbContext db, RollupWriter writer, TimeProvider time)
{
    /// <summary>How long 1-minute rows are kept.</summary>
    public static readonly TimeSpan OneMinuteRetention = TimeSpan.FromDays(7);

    /// <summary>How long 5-minute rows are kept, so a 30-day SLO window can be answered.</summary>
    public static readonly TimeSpan FiveMinuteRetention = TimeSpan.FromDays(90);

    /// <summary>Folds this far back each run, so a flush that arrives late is still counted in its 5-minute row.</summary>
    private static readonly TimeSpan _refoldWindow = TimeSpan.FromHours(1);

    private sealed class QueueRow
    {
        public int Pending { get; set; }
        public int Running { get; set; }
        public double OldestReadySeconds { get; set; }
    }

    public async Task RunAsync(CancellationToken cancellationToken)
    {
        using var activity = InfrastructureTelemetry.ActivitySource.StartActivity("rollup.maintenance");
        var now = time.GetUtcNow();
        await SampleQueueAsync(now, cancellationToken);
        await FoldAsync(now, cancellationToken);
        await PruneAsync(now, cancellationToken);
    }

    /// <summary>Samples the queue into the minute's bucket: how many jobs are pending and running, and how long the oldest ready one has waited.</summary>
    public async Task SampleQueueAsync(DateTimeOffset now, CancellationToken cancellationToken)
    {
        var queue = await db.Database.SqlQuery<QueueRow>(
            $"""
            SELECT COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
                   COUNT(*) FILTER (WHERE status = 'running')::int AS running,
                   COALESCE(EXTRACT(EPOCH FROM ({now} - MIN(run_after) FILTER (WHERE status = 'pending' AND run_after <= {now}))), 0)::float8 AS oldest_ready_seconds
            FROM crawl_jobs
            WHERE status IN ('pending', 'running')
            """).SingleAsync(cancellationToken);

        var bucket = Floor(now);
        await writer.SetGaugeAsync(bucket, RollupMetrics.QueueDepth, RollupMetrics.Dimension(("status", "pending")), queue.Pending, cancellationToken);
        await writer.SetGaugeAsync(bucket, RollupMetrics.QueueDepth, RollupMetrics.Dimension(("status", "running")), queue.Running, cancellationToken);
        await writer.SetGaugeAsync(bucket, RollupMetrics.QueueOldestPending, string.Empty, queue.OldestReadySeconds, cancellationToken);
    }

    /// <summary>
    /// Rewrites the 5-minute rows for the complete windows of the last hour from the 1-minute rows. The statement replaces
    /// the row, so running it again, or after a late flush, gives the right answer instead of a double count.
    /// </summary>
    public async Task FoldAsync(DateTimeOffset now, CancellationToken cancellationToken)
    {
        // A window is complete when it ended at least a minute ago: the flusher writes a minute a second after it ends.
        var to = FloorFive(now.AddMinutes(-1));
        var from = to - _refoldWindow;

        // LEARN: LG-04 date-bin | date_bin('5 minutes', t, origin) puts a timestamp in a fixed-width bucket counted from an origin, so the same rows always fall in the same 5-minute window and a GROUP BY on it is the whole fold; a gauge takes its latest sample with array_agg ordered newest first
        await db.Database.ExecuteSqlAsync(
            $"""
            INSERT INTO metric_rollups (resolution, bucket_start, metric, dimension, count, sum, min, max, last)
            SELECT '5m', date_bin('5 minutes', r.bucket_start, TIMESTAMPTZ '2000-01-01 00:00:00+00'), r.metric, r.dimension,
                   SUM(r.count), SUM(r.sum), MIN(r.min), MAX(r.max),
                   (ARRAY_AGG(r.last ORDER BY r.bucket_start DESC) FILTER (WHERE r.last IS NOT NULL))[1]
            FROM metric_rollups r
            WHERE r.resolution = '1m' AND r.bucket_start >= {from} AND r.bucket_start < {to}
            GROUP BY 2, 3, 4
            ON CONFLICT (resolution, bucket_start, metric, dimension) DO UPDATE
                SET count = EXCLUDED.count, sum = EXCLUDED.sum, min = EXCLUDED.min, max = EXCLUDED.max, last = EXCLUDED.last
            """,
            cancellationToken);
    }

    /// <summary>Deletes 1-minute rows older than 7 days and 5-minute rows older than 90.</summary>
    public async Task PruneAsync(DateTimeOffset now, CancellationToken cancellationToken)
    {
        var oneMinuteCutoff = now - OneMinuteRetention;
        var fiveMinuteCutoff = now - FiveMinuteRetention;
        await db.Database.ExecuteSqlAsync(
            $"""
            DELETE FROM metric_rollups
            WHERE (resolution = '1m' AND bucket_start < {oneMinuteCutoff})
               OR (resolution = '5m' AND bucket_start < {fiveMinuteCutoff})
            """,
            cancellationToken);
    }

    private static DateTimeOffset Floor(DateTimeOffset moment) =>
        new(moment.Year, moment.Month, moment.Day, moment.Hour, moment.Minute, 0, TimeSpan.Zero);

    private static DateTimeOffset FloorFive(DateTimeOffset moment) =>
        new(moment.Year, moment.Month, moment.Day, moment.Hour, moment.Minute / 5 * 5, 0, TimeSpan.Zero);
}
