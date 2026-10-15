using Microsoft.EntityFrameworkCore;
using Nodeable.Domain.Entities;
using Nodeable.Domain.Enums;
using Nodeable.Infrastructure.Crawling;
using Nodeable.Infrastructure.Deezer;
using Nodeable.Infrastructure.Persistence;
using Nodeable.Infrastructure.Persistence.Conversions;
using Nodeable.Infrastructure.Telemetry;

namespace Nodeable.Infrastructure.Ingestion;

/// <summary>
/// Step 5 of the fetch plan (FR-PREVIEW-01): find a recording's track at Deezer and store its track ID and cover ID.
/// First by ISRC, and when no ISRC finds a preview, by a search whose result must pass every rule of
/// <see cref="PreviewMatcher"/>. No credit comes from here and MusicBrainz is not asked: the recording job stored what
/// this needs. A recording Deezer does not have, or has without a preview, simply ends the job with no row; that is an
/// answer, not an error.
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
            .Select(r => new { r.Isrcs, r.Title, r.ArtistCredit, r.LengthMs })
            .SingleOrDefaultAsync(cancellationToken)
            ?? throw new CrawlJobPermanentFailureException($"There is no stored recording with MBID {job.TargetMbid}.");

        try
        {
            foreach (var isrc in recording.Isrcs.Take(MaxIsrcsTried))
            {
                var byIsrc = await deezer.GetTrackByIsrcAsync(isrc, cancellationToken);
                if (byIsrc?.PreviewUrl is not null)
                {
                    await StoreAsync(job.TargetMbid, byIsrc, PreviewMatch.Isrc, cancellationToken);
                    return;
                }
            }

            // No ISRC, or none that Deezer has a preview for. Without a length nothing can be checked, so nothing is tried.
            if (recording.LengthMs is > 0)
            {
                var candidates = await deezer.SearchTracksAsync(
                    PreviewMatcher.SearchQuery(recording.Title, recording.ArtistCredit),
                    cancellationToken);

                if (PreviewMatcher.Pick(recording.Title, recording.ArtistCredit, recording.LengthMs, candidates) is { } byTitle)
                {
                    await StoreAsync(job.TargetMbid, byTitle, PreviewMatch.TitleArtist, cancellationToken);
                    return;
                }

                // Candidates that all failed the guard are counted apart from "Deezer had nothing", so the hit rate can be
                // read as "found / (found + rejected + none)" and a guard that is too strict shows up.
                InfrastructureTelemetry.PreviewLookups.Add(
                    1,
                    new KeyValuePair<string, object?>("result", candidates.Count > 0 ? "rejected" : "none"));
                return;
            }
        }
        catch (DeezerException ex) when (!ex.IsTransient)
        {
            // A transient failure propagates and the queue retries the job; one that would repeat fails it now.
            throw new CrawlJobPermanentFailureException(ex.Message);
        }

        InfrastructureTelemetry.PreviewLookups.Add(1, new KeyValuePair<string, object?>("result", "none"));
    }

    private async Task StoreAsync(Guid recordingMbid, DeezerTrack track, PreviewMatch matchedBy, CancellationToken cancellationToken)
    {
        var matchedByText = EnumText.ToSnakeCase(matchedBy);

        // LEARN: LG-04 store-the-id | Store the stable identifier and never the address derived from it: a signed URL expires in minutes, so the row holds the track ID and each play asks for a fresh URL (decision 0022)
        await db.Database.ExecuteSqlAsync(
            $"""
            INSERT INTO previews (recording_mbid, provider, provider_track_id, cover_md5, matched_by, fetched_at)
            VALUES ({recordingMbid}, 'deezer', {track.Id}, {track.CoverMd5}, {matchedByText}, now())
            ON CONFLICT (recording_mbid, provider) DO UPDATE
                SET provider_track_id = EXCLUDED.provider_track_id, cover_md5 = EXCLUDED.cover_md5,
                    matched_by = EXCLUDED.matched_by, fetched_at = now()
                WHERE previews.matched_by <> 'user_pick'
            """,
            cancellationToken);

        InfrastructureTelemetry.PreviewLookups.Add(
            1,
            new KeyValuePair<string, object?>("result", "found"),
            new KeyValuePair<string, object?>("method", matchedByText));
    }
}
