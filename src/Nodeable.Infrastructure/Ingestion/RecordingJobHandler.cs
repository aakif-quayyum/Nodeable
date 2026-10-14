using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Nodeable.Domain.Dates;
using Nodeable.Domain.Entities;
using Nodeable.Domain.Enums;
using Nodeable.Domain.Mapping;
using Nodeable.Infrastructure.Crawling;
using Nodeable.Infrastructure.MusicBrainz;
using Nodeable.Infrastructure.Persistence;

namespace Nodeable.Infrastructure.Ingestion;

/// <summary>
/// Step 2 of the fetch plan (spec section 10): fetch a recording, store it with its releases, linked works and
/// recording-level credits, then queue the follow-up jobs it makes necessary (decision 0009). The Api queued this job;
/// everything after it is queued here, because only this response says which works, releases and ISRCs exist.
/// </summary>
public sealed class RecordingJobHandler(
    IMusicBrainzClient musicBrainz,
    NodeableDbContext db,
    CreditStore credits,
    ICrawlQueue queue,
    IOptions<IngestionOptions> options) : ICrawlJobHandler
{
    public async Task HandleAsync(CrawlJob job, CancellationToken cancellationToken)
    {
        var recording = await musicBrainz.GetRecordingAsync(job.TargetMbid, cancellationToken)
            ?? throw new CrawlJobPermanentFailureException($"MusicBrainz has no recording with MBID {job.TargetMbid}.");

        var works = (recording.Relations ?? []).Where(r => r.Work is not null).Select(r => r.Work!).DistinctBy(w => w.Id).ToList();
        var releases = (recording.Releases ?? []).DistinctBy(r => r.Id).ToList();
        var firstRelease = ParseDate(recording.FirstReleaseDate);
        var artistCredit = string.Concat((recording.ArtistCredit ?? []).Select(c => c.Name + c.JoinPhrase));
        var isrcs = (recording.Isrcs ?? []).Distinct().ToArray();

        IReadOnlySet<CreditRole> rolesAnywhere = new HashSet<CreditRole>();

        // One transaction, so a reader never sees a recording with its releases stored but its credits missing. The
        // execution strategy is what lets a transaction coexist with the connection retries Aspire turns on.
        await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

            await db.Database.ExecuteSqlAsync(
                $"""
                INSERT INTO recordings (mbid, title, artist_credit, first_release_date, first_release_date_precision, length_ms, isrcs, credits_status, fetched_at)
                VALUES ({recording.Id}, {recording.Title}, {artistCredit}, {firstRelease?.Date}, {ToText(firstRelease?.Precision)}, {recording.LengthMs}, {isrcs}, 'none', now())
                ON CONFLICT (mbid) DO UPDATE
                    SET title = EXCLUDED.title, artist_credit = EXCLUDED.artist_credit,
                        first_release_date = EXCLUDED.first_release_date,
                        first_release_date_precision = EXCLUDED.first_release_date_precision,
                        length_ms = EXCLUDED.length_ms, isrcs = EXCLUDED.isrcs, fetched_at = now()
                """,
                cancellationToken);

            if (releases.Count > 0)
            {
                var parsed = releases.Select(r => ParseDate(r.Date)).ToList();
                await db.Database.ExecuteSqlAsync(
                    $"""
                    INSERT INTO releases (mbid, title, date, date_precision, status, release_group_mbid, release_group_type, release_group_secondary_types, fetched_at)
                    SELECT t.mbid, t.title, t.date, t.precision, t.status, t.group_mbid, t.group_type, string_to_array(t.group_secondary, ','), now()
                    FROM unnest({releases.Select(r => r.Id).ToArray()}::uuid[], {releases.Select(r => r.Title).ToArray()}::text[],
                                {parsed.Select(d => d?.Date).ToArray()}::date[], {parsed.Select(d => ToText(d?.Precision)).ToArray()}::text[],
                                {releases.Select(r => r.Status).ToArray()}::text[], {releases.Select(r => r.ReleaseGroup?.Id).ToArray()}::uuid[],
                                {releases.Select(r => r.ReleaseGroup?.PrimaryType).ToArray()}::text[],
                                {releases.Select(r => string.Join(',', r.ReleaseGroup?.SecondaryTypes ?? [])).ToArray()}::text[])
                        AS t(mbid, title, date, precision, status, group_mbid, group_type, group_secondary)
                    ON CONFLICT (mbid) DO UPDATE
                        SET title = EXCLUDED.title, date = EXCLUDED.date, date_precision = EXCLUDED.date_precision,
                            status = EXCLUDED.status, release_group_mbid = EXCLUDED.release_group_mbid,
                            release_group_type = EXCLUDED.release_group_type,
                            release_group_secondary_types = EXCLUDED.release_group_secondary_types, fetched_at = now()
                    """,
                    cancellationToken);

                await db.Database.ExecuteSqlAsync(
                    $"""
                    INSERT INTO recording_releases (recording_mbid, release_mbid)
                    SELECT {recording.Id}::uuid, t.id FROM unnest({releases.Select(r => r.Id).ToArray()}::uuid[]) AS t(id)
                    ON CONFLICT DO NOTHING
                    """,
                    cancellationToken);
            }

            if (works.Count > 0)
            {
                // Only the work's title is known here; its credits come from its own job. fetched_at is touched
                // by that job, not this one.
                await db.Database.ExecuteSqlAsync(
                    $"""
                    INSERT INTO works (mbid, title, fetched_at)
                    SELECT t.mbid, t.title, now()
                    FROM unnest({works.Select(w => w.Id).ToArray()}::uuid[], {works.Select(w => w.Title).ToArray()}::text[]) AS t(mbid, title)
                    ON CONFLICT (mbid) DO UPDATE SET title = EXCLUDED.title
                    """,
                    cancellationToken);

                await db.Database.ExecuteSqlAsync(
                    $"""
                    INSERT INTO recording_works (recording_mbid, work_mbid)
                    SELECT {recording.Id}::uuid, t.id FROM unnest({works.Select(w => w.Id).ToArray()}::uuid[]) AS t(id)
                    ON CONFLICT DO NOTHING
                    """,
                    cancellationToken);
            }

            await credits.PersistAsync(CreditSubjectType.Recording, recording.Id, recording.Relations, cancellationToken);
            var statuses = await credits.RefreshCreditsStatusAsync([recording.Id], cancellationToken);
            rolesAnywhere = statuses[recording.Id];

            await transaction.CommitAsync(cancellationToken);
        });

        // Follow-ups are queued after the commit. If the process dies between the commit and here, the job is
        // recovered and run again; everything above is idempotent, and the queue ignores a fetch already queued.
        // The enqueue happens inside the crawl.job span, so each follow-up is in the same trace, and it inherits
        // the priority, so a person's click stays ahead of background work (decision 0009).
        foreach (var work in works)
        {
            await queue.EnqueueAsync(CrawlJobKind.Work, work.Id, job.Priority, cancellationToken);
        }

        // Spec section 10, step 4: the release is fetched only when no producer was found. Work relationships can
        // not change that, because MusicBrainz has no producer relationship between an artist and a work (only
        // composer, lyricist, writer and similar), so the answer is already known once the recording is stored.
        if (!rolesAnywhere.Contains(CreditRole.Producer))
        {
            var releaseToFetch = ReleaseSelector.Earliest(releases.Select(r => (r.Id, ParseDate(r.Date)?.Date)));
            if (releaseToFetch is { } releaseMbid)
            {
                await queue.EnqueueAsync(CrawlJobKind.Release, releaseMbid, job.Priority, cancellationToken);
            }
        }

        if (options.Value.QueuePreviewJobs)
        {
            // Every recording gets a preview job: by ISRC when it has one, and by title and artist when it has none or Deezer does
            // not know it (decision 0025). The preview is stored per recording, so the recording is the target.
            await queue.EnqueueAsync(CrawlJobKind.Preview, recording.Id, job.Priority, cancellationToken);
        }
    }

    private static PartialDate? ParseDate(string? text) =>
        PartialDate.TryParse(text, out var date) ? date : null;

    private static string? ToText(DatePrecision? precision) => precision?.ToString().ToLowerInvariant();
}
