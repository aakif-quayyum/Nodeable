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

    public DateTimeOffset FetchedAt { get; set; }
}
