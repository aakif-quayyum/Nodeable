using System.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Nodeable.Domain.Crawling;
using Nodeable.Domain.Enums;
using Nodeable.Infrastructure.Crawling;
using Nodeable.Infrastructure.Persistence;
using Nodeable.Infrastructure.Telemetry;

namespace Nodeable.Infrastructure.Refresh;

/// <summary>
/// The selection half of the 30-day refresh (NFR-REL-03, decision 0028): finds the stored recordings, works and
/// releases that are older than <see cref="RefreshOptions.MaxAge"/> and queues a fetch for each at the scheduled
/// priority, each after a random delay. It makes no MusicBrainz request itself: the fetches go through the same crawl
/// queue, handlers and shared rate gate as everything else, so an interactive request always goes first.
/// People have no fetch of their own: a person is rewritten whenever a recording, work or release they are credited on
/// is fetched, so refreshing those refreshes them.
/// </summary>
public sealed class StaleCacheRefresher(NodeableDbContext db, ICrawlQueue queue, IOptions<RefreshOptions> options)
{
    private sealed class StaleRow
    {
        public string Kind { get; set; } = string.Empty;
        public Guid Mbid { get; set; }
    }

    /// <summary>Queues the next batch. Returns how many fetches were queued.</summary>
    public async Task<int> RunAsync(CancellationToken cancellationToken)
    {
        var settings = options.Value;
        using var activity = InfrastructureTelemetry.ActivitySource.StartActivity("refresh.select");

        var maxAgeSeconds = settings.MaxAge.TotalSeconds;
        // No cut-off means no backfill: the epoch is older than any stored row.
        var backfillBefore = settings.IsrcBackfillBefore ?? DateTimeOffset.UnixEpoch;

        // Rows already waiting in the queue are left out, and so are rows whose last fetch failed for good within the
        // window (MusicBrainz no longer has them): without that, the same few rows would fill every batch.
        // LEARN: LG-04 stale-selection | Three tables are read as one list with UNION ALL, and NOT EXISTS against the queue keeps a row out while its fetch is waiting or has just failed for good, so a slow or broken row cannot starve the rest of the batch
        var rows = await db.Database.SqlQuery<StaleRow>(
            $"""
            WITH stale AS (
                SELECT 'recording' AS kind, r.mbid AS mbid, r.fetched_at AS fetched_at
                FROM recordings r
                WHERE r.fetched_at < now() - ({maxAgeSeconds} * interval '1 second')
                   OR (cardinality(r.isrcs) = 0 AND r.fetched_at < {backfillBefore})
                UNION ALL
                SELECT 'work', w.mbid, w.fetched_at
                FROM works w WHERE w.fetched_at < now() - ({maxAgeSeconds} * interval '1 second')
                UNION ALL
                SELECT 'release', rel.mbid, rel.fetched_at
                FROM releases rel WHERE rel.fetched_at < now() - ({maxAgeSeconds} * interval '1 second')
            )
            SELECT s.kind AS kind, s.mbid AS mbid
            FROM stale s
            WHERE NOT EXISTS (
                SELECT 1 FROM crawl_jobs j
                WHERE j.kind = s.kind AND j.target_mbid = s.mbid
                  AND (j.status IN ('pending', 'running')
                       OR (j.status = 'failed' AND j.run_after > now() - ({maxAgeSeconds} * interval '1 second'))))
            ORDER BY s.fetched_at, s.mbid
            LIMIT {settings.BatchPerRun}
            """).ToListAsync(cancellationToken);

        var queued = 0;
        foreach (var row in rows)
        {
            var kind = row.Kind switch
            {
                "recording" => CrawlJobKind.Recording,
                "work" => CrawlJobKind.Work,
                "release" => CrawlJobKind.Release,
                _ => throw new UnreachableException($"Unknown stale kind {row.Kind}."),
            };

            // cache.lookups (spec section 11): a stored row that is read as too old is a "stale" lookup of its entity.
            InfrastructureTelemetry.CacheLookups.Add(1, new("entity", row.Kind), new("result", "stale"));

            var delay = TimeSpan.FromSeconds(Random.Shared.NextDouble() * settings.MaxDelay.TotalSeconds);
            if (await queue.EnqueueAsync(kind, row.Mbid, CrawlPriority.Scheduled, delay, cancellationToken) == EnqueueResult.Enqueued)
            {
                queued++;
            }
        }

        activity?.SetTag("refresh.selected", rows.Count);
        activity?.SetTag("refresh.queued", queued);
        return queued;
    }
}
