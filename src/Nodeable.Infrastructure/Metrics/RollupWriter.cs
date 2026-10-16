using Microsoft.EntityFrameworkCore;
using Nodeable.Infrastructure.Persistence;

namespace Nodeable.Infrastructure.Metrics;

/// <summary>Writes the rollup's rows (spec section 8, <c>metric_rollups</c>). Every method is one SQL statement.</summary>
public sealed class RollupWriter(NodeableDbContext db)
{
    /// <summary>
    /// Adds deltas to the 1-minute bucket that starts at <paramref name="bucketStart"/>. A row that exists is added to, so
    /// the Api, the Worker and any number of instances can all write into the same minute without overwriting each other.
    /// </summary>
    public async Task AddAsync(DateTimeOffset bucketStart, IReadOnlyList<RollupDelta> deltas, CancellationToken cancellationToken)
    {
        if (deltas.Count == 0)
        {
            return;
        }

        // LEARN: LG-04 additive-upsert | ON CONFLICT DO UPDATE SET count = count + excluded.count turns an insert into "add to whatever is there", so several processes can write the same bucket without a read first and without losing each other's numbers (min and max use LEAST and GREATEST, which ignore nulls)
        await db.Database.ExecuteSqlAsync(
            $"""
            INSERT INTO metric_rollups (resolution, bucket_start, metric, dimension, count, sum, min, max)
            SELECT '1m', {bucketStart}, t.metric, t.dimension, t.count, t.sum, t.min, t.max
            FROM unnest({deltas.Select(d => d.Metric).ToArray()}::text[], {deltas.Select(d => d.Dimension).ToArray()}::text[],
                        {deltas.Select(d => d.Count).ToArray()}::bigint[], {deltas.Select(d => d.Sum).ToArray()}::double precision[],
                        {deltas.Select(d => d.Min).ToArray()}::double precision[], {deltas.Select(d => d.Max).ToArray()}::double precision[])
                AS t(metric, dimension, count, sum, min, max)
            ON CONFLICT (resolution, bucket_start, metric, dimension) DO UPDATE
                SET count = metric_rollups.count + EXCLUDED.count,
                    sum = CASE WHEN metric_rollups.sum IS NULL AND EXCLUDED.sum IS NULL THEN NULL
                               ELSE COALESCE(metric_rollups.sum, 0) + COALESCE(EXCLUDED.sum, 0) END,
                    min = LEAST(metric_rollups.min, EXCLUDED.min),
                    max = GREATEST(metric_rollups.max, EXCLUDED.max)
            """,
            cancellationToken);
    }

    /// <summary>Stores one sample of a gauge in the 1-minute bucket, replacing an earlier sample of the same minute.</summary>
    public async Task SetGaugeAsync(DateTimeOffset bucketStart, string metric, string dimension, double value, CancellationToken cancellationToken) =>
        await db.Database.ExecuteSqlAsync(
            $"""
            INSERT INTO metric_rollups (resolution, bucket_start, metric, dimension, count, sum, min, max, last)
            VALUES ('1m', {bucketStart}, {metric}, {dimension}, 1, {value}, {value}, {value}, {value})
            ON CONFLICT (resolution, bucket_start, metric, dimension) DO UPDATE
                SET count = 1, sum = EXCLUDED.sum, min = EXCLUDED.min, max = EXCLUDED.max, last = EXCLUDED.last
            """,
            cancellationToken);
}
