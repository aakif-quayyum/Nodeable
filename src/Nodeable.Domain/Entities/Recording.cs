using Nodeable.Domain.Enums;

namespace Nodeable.Domain.Entities;

/// <summary>A specific performance of a song, keyed by its MusicBrainz ID (spec section 8, <c>recordings</c>).</summary>
// LEARN: LG-01 entity-class | Entities are plain classes, not records: EF Core tracks each row as one object instance and mutates it, while a record compares by value and is meant to be immutable
public class Recording
{
    // LEARN: LG-01 init-vs-set | "init" can only be assigned when the object is created (the key never changes); "set" stays writable because a re-crawl updates the other columns. "required" makes the compiler reject any new Recording that omits the property
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
