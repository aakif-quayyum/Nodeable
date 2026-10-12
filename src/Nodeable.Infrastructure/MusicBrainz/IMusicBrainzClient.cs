using Nodeable.Infrastructure.MusicBrainz.Models;

namespace Nodeable.Infrastructure.MusicBrainz;

/// <summary>
/// The MusicBrainz web service calls of the fetch plan in spec section 10. Only the Worker calls this: it is the one
/// place that enforces the rate limit (spec section 7). A lookup of an MBID MusicBrainz does not know returns null.
/// </summary>
public interface IMusicBrainzClient
{
    /// <summary>Step 1: search recordings by title and optional artist (FR-SEARCH-01).</summary>
    Task<RecordingSearchResponse> SearchRecordingsAsync(string title, string? artist = null, int limit = 10, CancellationToken cancellationToken = default);

    /// <summary>Step 2: a recording's credits, linked works, releases and ISRCs.</summary>
    Task<RecordingLookup?> GetRecordingAsync(Guid mbid, CancellationToken cancellationToken = default);

    /// <summary>
    /// A recording's title and artist credit only, the lightest lookup MusicBrainz offers. The Api uses it to confirm
    /// that an MBID a client sends exists, and to learn its real title, before the recording is stored.
    /// </summary>
    Task<RecordingLookup?> GetRecordingSummaryAsync(Guid mbid, CancellationToken cancellationToken = default);

    /// <summary>Step 3: a work's composer, lyricist and writer credits.</summary>
    Task<WorkLookup?> GetWorkAsync(Guid mbid, CancellationToken cancellationToken = default);

    /// <summary>Step 4: a release's artist relationships, used only when no producer was found yet.</summary>
    Task<ReleaseLookup?> GetReleaseAsync(Guid mbid, CancellationToken cancellationToken = default);
}
