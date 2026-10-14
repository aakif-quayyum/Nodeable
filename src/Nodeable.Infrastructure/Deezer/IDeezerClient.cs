namespace Nodeable.Infrastructure.Deezer;

/// <summary>
/// A track at Deezer, as much of it as Nodeable uses.
/// </summary>
/// <param name="Id">Deezer's track ID, the only thing stored about the track (a preview URL expires).</param>
/// <param name="Title">The title Deezer has for the track.</param>
/// <param name="PreviewUrl">
/// A signed URL for the 30-second preview that expires about 15 minutes after Deezer issued it, or null when the track
/// has no preview. Never store it.
/// </param>
/// <param name="CoverMd5">The ID of the album cover image (<c>album.md5_image</c>), or null when there is none.</param>
public sealed record DeezerTrack(string Id, string Title, string? PreviewUrl, string? CoverMd5);

/// <summary>
/// The Deezer calls of FR-PREVIEW-01 (spec section 10). Both return null when Deezer has no such track: Deezer
/// reports that as an HTTP 200 with an error body, which the client turns into null so callers never see the quirk.
/// </summary>
public interface IDeezerClient
{
    /// <summary>The track Deezer has for an ISRC, or null.</summary>
    /// <exception cref="DeezerException">Deezer could not answer; <see cref="DeezerException.IsTransient"/> says whether trying again may help.</exception>
    Task<DeezerTrack?> GetTrackByIsrcAsync(string isrc, CancellationToken cancellationToken = default);

    /// <summary>The track with a Deezer ID, with a freshly signed preview URL, or null.</summary>
    /// <exception cref="DeezerException">Deezer could not answer.</exception>
    Task<DeezerTrack?> GetTrackAsync(string trackId, CancellationToken cancellationToken = default);
}

/// <summary>Deezer did not give an answer: an error status, an error body that is not "no data", or an unreadable body.</summary>
public sealed class DeezerException(string message, bool isTransient, Exception? inner = null) : Exception(message, inner)
{
    /// <summary>
    /// True for a failure that may pass (a 5xx, 429, or Deezer's quota and busy errors), so a job is retried later;
    /// false for one that would repeat (a bad parameter, an unreadable body), so a job is failed at once.
    /// </summary>
    public bool IsTransient { get; } = isTransient;
}
