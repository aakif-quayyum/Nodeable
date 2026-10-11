using Microsoft.EntityFrameworkCore;
using Nodeable.Domain.Crawling;
using Nodeable.Domain.Enums;
using Nodeable.Infrastructure.Persistence;

namespace Nodeable.Infrastructure.Crawling;

/// <summary>What <see cref="SongIngestionService.RequestAsync"/> found and did.</summary>
public enum IngestionRequestResult
{
    /// <summary>Credits are already stored; the caller can answer from the database and nothing was queued.</summary>
    Cached,

    /// <summary>A recording fetch was queued.</summary>
    Queued,

    /// <summary>A recording fetch was already pending or running; the caller waits for that one.</summary>
    AlreadyQueued,
}

/// <summary>
/// The Api's half of "adding a song" (spec section 7, steps 2 and 3, decision 0009): answer from the cache when
/// possible, otherwise record the song and queue the one fetch that tells everything else what to fetch. The Api never
/// queues the work, release or preview jobs: their MBIDs are only known from the recording's response, so the Worker
/// queues them. The REST endpoint that calls this arrives in M3.
/// </summary>
public sealed class SongIngestionService(NodeableDbContext db, ICrawlQueue queue)
{
    public async Task<IngestionRequestResult> RequestAsync(
        Guid recordingMbid, string title, string artistCredit, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(title);
        ArgumentException.ThrowIfNullOrWhiteSpace(artistCredit);

        // Both "complete" and "partial" are answers the user can be given now; only "none" still needs a fetch.
        var alreadyCached = await db.Recordings.AnyAsync(
            r => r.Mbid == recordingMbid && r.CreditsStatus != CreditsStatus.None, cancellationToken);
        if (alreadyCached)
        {
            return IngestionRequestResult.Cached;
        }

        // The recording row exists before any credit refers to it (spec section 8, foreign keys). The stub carries
        // only what the user's search result already told us; the Worker fills in the rest. DO NOTHING keeps a row the
        // Worker has already filled in.
        await db.Database.ExecuteSqlAsync(
            $"""
            INSERT INTO recordings (mbid, title, artist_credit, credits_status)
            VALUES ({recordingMbid}, {title}, {artistCredit}, 'none')
            ON CONFLICT (mbid) DO NOTHING
            """,
            cancellationToken);

        var queued = await queue.EnqueueAsync(CrawlJobKind.Recording, recordingMbid, CrawlPriority.Interactive, cancellationToken);
        return queued == EnqueueResult.Enqueued ? IngestionRequestResult.Queued : IngestionRequestResult.AlreadyQueued;
    }
}
