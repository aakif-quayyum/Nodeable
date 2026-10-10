using Nodeable.Domain.Enums;

namespace Nodeable.Domain.Entities;

/// <summary>A specific performance of a song, keyed by its MusicBrainz ID (spec section 8, <c>recordings</c>).</summary>
public class Recording
{
    public required Guid Mbid { get; init; }

    public required string Title { get; set; }

    public required string ArtistCredit { get; set; }

    /// <summary>
    /// MusicBrainz dates can be partial ("1995" or "1995-03"); how that maps onto a full date is decided in M2 when the client is built.
    /// </summary>
    public DateOnly? FirstReleaseDate { get; set; }

    public int? LengthMs { get; set; }

    public CreditsStatus CreditsStatus { get; set; } = CreditsStatus.None;

    public DateTimeOffset FetchedAt { get; set; }
}
