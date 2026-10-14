using Microsoft.EntityFrameworkCore;
using Nodeable.Domain.Entities;
using Nodeable.Infrastructure.Crawling;
using Nodeable.Infrastructure.Deezer;
using Nodeable.Infrastructure.Persistence;
using Nodeable.Infrastructure.Telemetry;

namespace Nodeable.Infrastructure.Ingestion;

/// <summary>
/// Step 5 of the fetch plan (FR-PREVIEW-01): look a recording up at Deezer by ISRC and store its track ID and cover ID.
/// No credit comes from here and MusicBrainz is not asked: the ISRCs were stored by the recording job. A recording
/// Deezer does not have, or has without a preview, simply ends the job with no row; that is an answer, not an error.
/// </summary>
public sealed class PreviewJobHandler(IDeezerClient deezer, NodeableDbContext db) : ICrawlJobHandler
{
    /// <summary>Most recordings have one ISRC; a few have several. More than this is not worth the requests.</summary>
    private const int MaxIsrcsTried = 3;

    public async Task HandleAsync(CrawlJob job, CancellationToken cancellationToken)
    {
        var recording = await db.Recordings
            .AsNoTracking()
            .Where(r => r.Mbid == job.TargetMbid)
            .Select(r => new { r.Isrcs })
            .SingleOrDefaultAsync(cancellationToken)
            ?? throw new CrawlJobPermanentFailureException($"There is no stored recording with MBID {job.TargetMbid}.");

        foreach (var isrc in recording.Isrcs.Take(MaxIsrcsTried))
        {
            DeezerTrack? track;
            try
            {
                track = await deezer.GetTrackByIsrcAsync(isrc, cancellationToken);
            }
            catch (DeezerException ex) when (!ex.IsTransient)
            {
                // A transient failure propagates and the queue retries the job; one that would repeat fails it now.
                throw new CrawlJobPermanentFailureException(ex.Message);
            }

            if (track?.PreviewUrl is null)
            {
                continue;
            }

            // LEARN: LG-04 store-the-id | Store the stable identifier and never the address derived from it: a signed URL expires in minutes, so the row holds the track ID and each play asks for a fresh URL (decision 0022)
            await db.Database.ExecuteSqlAsync(
                $"""
                INSERT INTO previews (recording_mbid, provider, provider_track_id, cover_md5, fetched_at)
                VALUES ({job.TargetMbid}, 'deezer', {track.Id}, {track.CoverMd5}, now())
                ON CONFLICT (recording_mbid, provider) DO UPDATE
                    SET provider_track_id = EXCLUDED.provider_track_id, cover_md5 = EXCLUDED.cover_md5, fetched_at = now()
                """,
                cancellationToken);

            InfrastructureTelemetry.PreviewLookups.Add(1, new KeyValuePair<string, object?>("result", "found"));
            return;
        }

        InfrastructureTelemetry.PreviewLookups.Add(1, new KeyValuePair<string, object?>("result", "none"));
    }
}
