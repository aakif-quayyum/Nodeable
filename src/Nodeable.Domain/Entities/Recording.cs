using Nodeable.Domain.Dates;
using Nodeable.Domain.Enums;

namespace Nodeable.Domain.Entities;

/// <summary>A specific performance of a song, keyed by its MusicBrainz ID (spec section 8, <c>recordings</c>).</summary>
public class Recording
{
    public required Guid Mbid { get; init; }

    public required string Title { get; set; }

    public required string ArtistCredit { get; set; }

    /// <summary>
    /// The earliest possible day of the first release date (1995-01-01 for "1995"). Read it together with
    /// <see cref="FirstReleaseDatePrecision"/>, and set both through <see cref="SetFirstReleaseDate"/>.
    /// </summary>
    public DateOnly? FirstReleaseDate { get; private set; }

    /// <summary>How much of <see cref="FirstReleaseDate"/> is known; null exactly when the date is null (decision 0008).</summary>
    public DatePrecision? FirstReleaseDatePrecision { get; private set; }

    public int? LengthMs { get; set; }

    /// <summary>
    /// The recording's ISRCs as MusicBrainz lists them (spec section 8). Deezer is looked up by ISRC (FR-PREVIEW-01), and the
    /// preview job runs after the recording job, so the codes are stored instead of fetched again. Empty until the recording
    /// is fetched again for rows stored before M4.
    /// </summary>
    public string[] Isrcs { get; set; } = [];

    public CreditsStatus CreditsStatus { get; set; } = CreditsStatus.None;

    public DateTimeOffset FetchedAt { get; set; }

    // LEARN: LG-02 private-setter | A private setter lets the type keep two properties consistent: callers can read both but can only change them together through this method, so a date can never exist without its precision
    /// <summary>Sets the date and its precision together; null clears both.</summary>
    public void SetFirstReleaseDate(PartialDate? date)
    {
        FirstReleaseDate = date?.Date;
        FirstReleaseDatePrecision = date?.Precision;
    }
}
