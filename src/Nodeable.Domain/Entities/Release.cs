using Nodeable.Domain.Dates;
using Nodeable.Domain.Enums;

namespace Nodeable.Domain.Entities;

/// <summary>An album or single (spec section 8, <c>releases</c>).</summary>
public class Release
{
    public required Guid Mbid { get; init; }

    public required string Title { get; set; }

    /// <summary>The earliest possible day of the release date. Set it, with its precision, through <see cref="SetDate"/>.</summary>
    public DateOnly? Date { get; private set; }

    /// <summary>How much of <see cref="Date"/> is known; null exactly when the date is null (decision 0008).</summary>
    public DatePrecision? DatePrecision { get; private set; }

    /// <summary>MusicBrainz's release status (Official, Promotion, Bootleg, Pseudo-Release); null when it was not said.</summary>
    public string? Status { get; set; }

    /// <summary>The release group this release belongs to, the second place a cover is looked for (FR-ART-01); null until it is fetched with release groups.</summary>
    public Guid? ReleaseGroupMbid { get; set; }

    /// <summary>The group's primary type (Album, Single, EP, ...); null when not said.</summary>
    public string? ReleaseGroupType { get; set; }

    /// <summary>The group's secondary types (Live, Compilation, DJ-mix, Remix, ...); empty when it has none or they are not known.</summary>
    public string[] ReleaseGroupSecondaryTypes { get; set; } = [];

    public DateTimeOffset FetchedAt { get; set; }

    /// <summary>Sets the date and its precision together; null clears both.</summary>
    public void SetDate(PartialDate? date)
    {
        Date = date?.Date;
        DatePrecision = date?.Precision;
    }
}
