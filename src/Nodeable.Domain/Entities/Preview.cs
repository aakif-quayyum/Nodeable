using Nodeable.Domain.Enums;

namespace Nodeable.Domain.Entities;

/// <summary>
/// A recording's track at a preview provider (spec section 8, <c>previews</c>). Only the track ID is stored;
/// preview URLs expire, so a fresh one is requested on demand (spec section 10).
/// </summary>
public class Preview
{
    public required Guid RecordingMbid { get; init; }

    public required PreviewProvider Provider { get; init; }

    public required string ProviderTrackId { get; set; }

    /// <summary>
    /// The provider's image ID for the album cover (Deezer's <c>md5_image</c>), which is a stable ID and not an expiring URL.
    /// The art chain builds the image address from it (spec section 10, step 3). Null when the track has no cover.
    /// </summary>
    public string? CoverMd5 { get; set; }

    /// <summary>How the track was found: by the recording's ISRC, or by a guarded title and artist match (FR-PREVIEW-01).</summary>
    public PreviewMatch MatchedBy { get; set; } = PreviewMatch.Isrc;

    public DateTimeOffset FetchedAt { get; set; }
}
