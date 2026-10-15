using Microsoft.EntityFrameworkCore;
using Nodeable.Domain.Enums;
using Nodeable.Infrastructure.Persistence;
using Nodeable.Infrastructure.Telemetry;

namespace Nodeable.Infrastructure.Deezer;

/// <summary>One of Deezer's search results offered to a person who is choosing the right version of a song.</summary>
public sealed record PreviewCandidate(string TrackId, string Title, string Artist, string? Album, int? DurationSeconds, string? CoverMd5);

/// <summary>How a request to pick a version ended.</summary>
public enum PickOutcome
{
    Picked,
    RecordingNotFound,

    /// <summary>A preview row exists already (found by a refresh, or picked by someone else a moment ago).</summary>
    AlreadyHasPreview,

    /// <summary>The track is not among the results Deezer gives for this recording now, so it was never offered.</summary>
    NotACandidate,
}

public sealed record PickResult(PickOutcome Outcome, string? CoverMd5 = null);

/// <summary>
/// FR-PREVIEW-01, decision 0026: when no match is confident enough for a recording to have a preview, a person may
/// choose the right version from Deezer's top results, and the choice is stored for everyone. Because the choice is
/// written to a cache that every visitor reads, the server never trusts the track the browser names: it asks Deezer
/// again and accepts only a track that is among the results it would have offered.
/// </summary>
public sealed class PreviewPickService(NodeableDbContext db, IDeezerClient deezer)
{
    /// <summary>How many results are offered. Five is enough to find the version; more is a longer list to read.</summary>
    public const int MaxCandidates = 5;

    /// <summary>
    /// The first results of Deezer's search for the recording that have a preview, or null when the recording is not
    /// stored. A result without a preview is left out: it could not be played, so choosing it would help nobody.
    /// </summary>
    /// <exception cref="DeezerException">Deezer could not answer.</exception>
    public async Task<IReadOnlyList<PreviewCandidate>?> GetCandidatesAsync(Guid recordingMbid, CancellationToken cancellationToken)
    {
        var recording = await db.Recordings
            .AsNoTracking()
            .Where(r => r.Mbid == recordingMbid)
            .Select(r => new { r.Title, r.ArtistCredit })
            .SingleOrDefaultAsync(cancellationToken);

        if (recording is null)
        {
            return null;
        }

        var results = await deezer.SearchTracksAsync(PreviewMatcher.SearchQuery(recording.Title, recording.ArtistCredit), cancellationToken);

        return results
            .Where(t => t.PreviewUrl is not null)
            .DistinctBy(t => t.Id)
            .Take(MaxCandidates)
            .Select(t => new PreviewCandidate(t.Id, t.Title, t.ArtistName ?? string.Empty, t.AlbumTitle, t.DurationSeconds, t.CoverMd5))
            .ToList();
    }

    /// <summary>Stores a person's choice, when it is one of the results offered and the recording has no preview yet.</summary>
    /// <exception cref="DeezerException">Deezer could not answer.</exception>
    public async Task<PickResult> PickAsync(Guid recordingMbid, string trackId, CancellationToken cancellationToken)
    {
        if (!await db.Recordings.AsNoTracking().AnyAsync(r => r.Mbid == recordingMbid, cancellationToken))
        {
            return new PickResult(PickOutcome.RecordingNotFound);
        }

        if (await db.Previews.AsNoTracking().AnyAsync(p => p.RecordingMbid == recordingMbid, cancellationToken))
        {
            return new PickResult(PickOutcome.AlreadyHasPreview);
        }

        // LEARN: LG-04 server-validates-choice | A choice that lands in a cache everyone reads is re-checked on the server: the browser sends only an id, and the Api asks Deezer again and accepts it only if it is among the results it would have offered
        var candidates = await GetCandidatesAsync(recordingMbid, cancellationToken) ?? [];
        var chosen = candidates.FirstOrDefault(c => c.TrackId == trackId);
        if (chosen is null)
        {
            return new PickResult(PickOutcome.NotACandidate);
        }

        // DO NOTHING: a preview that arrived since (a refresh, or another person's pick) wins; this one never replaces it.
        var written = await db.Database.ExecuteSqlAsync(
            $"""
            INSERT INTO previews (recording_mbid, provider, provider_track_id, cover_md5, matched_by, picked_at, fetched_at)
            VALUES ({recordingMbid}, 'deezer', {chosen.TrackId}, {chosen.CoverMd5}, 'user_pick', now(), now())
            ON CONFLICT (recording_mbid, provider) DO NOTHING
            """,
            cancellationToken);

        if (written == 0)
        {
            return new PickResult(PickOutcome.AlreadyHasPreview);
        }

        InfrastructureTelemetry.PreviewLookups.Add(
            1,
            new KeyValuePair<string, object?>("result", "found"),
            new KeyValuePair<string, object?>("method", "user_pick"));
        return new PickResult(PickOutcome.Picked, chosen.CoverMd5);
    }
}
