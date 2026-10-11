using Microsoft.EntityFrameworkCore;
using Nodeable.Domain.Dates;
using Nodeable.Domain.Entities;
using Nodeable.Domain.Enums;
using Nodeable.Infrastructure.Crawling;
using Nodeable.Infrastructure.MusicBrainz;
using Nodeable.Infrastructure.Persistence;

namespace Nodeable.Infrastructure.Ingestion;

/// <summary>
/// Step 3 of the fetch plan: a work's composer, lyricist and writer credits. A work can be linked to several
/// recordings (covers, live versions), and each of them gains these credits, so the status of every linked recording
/// is recomputed.
/// </summary>
public sealed class WorkJobHandler(IMusicBrainzClient musicBrainz, NodeableDbContext db, CreditStore credits) : ICrawlJobHandler
{
    public async Task HandleAsync(CrawlJob job, CancellationToken cancellationToken)
    {
        var work = await musicBrainz.GetWorkAsync(job.TargetMbid, cancellationToken)
            ?? throw new CrawlJobPermanentFailureException($"MusicBrainz has no work with MBID {job.TargetMbid}.");

        await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

            await db.Database.ExecuteSqlAsync(
                $"""
                INSERT INTO works (mbid, title, fetched_at) VALUES ({work.Id}, {work.Title}, now())
                ON CONFLICT (mbid) DO UPDATE SET title = EXCLUDED.title, fetched_at = now()
                """,
                cancellationToken);

            await credits.PersistAsync(CreditSubjectType.Work, work.Id, work.Relations, cancellationToken);

            var recordings = await db.Database
                .SqlQuery<Guid>($"""SELECT recording_mbid AS "Value" FROM recording_works WHERE work_mbid = {work.Id}""")
                .ToListAsync(cancellationToken);
            await credits.RefreshCreditsStatusAsync(recordings, cancellationToken);

            await transaction.CommitAsync(cancellationToken);
        });
    }
}

/// <summary>
/// Step 4 of the fetch plan: a release's artist relationships, fetched only when the recording had no producer
/// credit (the recording handler decides that and queues this job).
/// </summary>
public sealed class ReleaseJobHandler(IMusicBrainzClient musicBrainz, NodeableDbContext db, CreditStore credits) : ICrawlJobHandler
{
    public async Task HandleAsync(CrawlJob job, CancellationToken cancellationToken)
    {
        var release = await musicBrainz.GetReleaseAsync(job.TargetMbid, cancellationToken)
            ?? throw new CrawlJobPermanentFailureException($"MusicBrainz has no release with MBID {job.TargetMbid}.");

        PartialDate? date = PartialDate.TryParse(release.Date, out var parsed) ? parsed : null;
        var precision = date?.Precision.ToString().ToLowerInvariant();

        await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

            await db.Database.ExecuteSqlAsync(
                $"""
                INSERT INTO releases (mbid, title, date, date_precision, fetched_at)
                VALUES ({release.Id}, {release.Title}, {date?.Date}, {precision}, now())
                ON CONFLICT (mbid) DO UPDATE
                    SET title = EXCLUDED.title, date = EXCLUDED.date, date_precision = EXCLUDED.date_precision, fetched_at = now()
                """,
                cancellationToken);

            await credits.PersistAsync(CreditSubjectType.Release, release.Id, release.Relations, cancellationToken);

            var recordings = await db.Database
                .SqlQuery<Guid>($"""SELECT recording_mbid AS "Value" FROM recording_releases WHERE release_mbid = {release.Id}""")
                .ToListAsync(cancellationToken);
            await credits.RefreshCreditsStatusAsync(recordings, cancellationToken);

            await transaction.CommitAsync(cancellationToken);
        });
    }
}
